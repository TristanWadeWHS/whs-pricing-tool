import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeForm, sampleAnalysis, sampleInputs } from './helpers';
import { clarificationQuestions, issueClarification, verifyClarification, type ClarificationAnswer } from '../app/lib/clarification';
import { validateEstimateForm } from '../app/lib/request-validation';
import { priceJob } from '../app/lib/pricing';
import { canDisplayEstimate } from '../app/lib/analyze-client';
import { ANALYSIS_CONFIDENCE_LABEL, ANALYSIS_CONFIDENCE_NOTE } from '../app/lib/analysis-confidence';
import { assessInternalEstimate } from '../app/lib/internal-estimate';
import { normalizeClarificationAnswer, reconcileClarificationFacts } from '../app/lib/clarification-facts';
const parseMock = vi.hoisted(() => vi.fn());
vi.mock('openai', () => ({ default: vi.fn(function () { return { responses: { parse: parseMock } }; }) }));
import { POST } from '../app/api/analyze/route';

afterEach(() => { vi.unstubAllEnvs(); parseMock.mockReset(); });
const low = () => sampleAnalysis({ confidencePercent: 73, questionsToAsk: ['Anything hidden?'], uncertaintyNotes: ['Hidden items unclear'] });
async function post(form = makeForm()) {
  vi.stubEnv('OPENAI_API_KEY', 'synthetic-server-only-key');
  const response = await POST(new Request('http://localhost/api/analyze', { method: 'POST', body: form }) as never);
  return { status: response.status, body: await response.json() };
}
async function begin() { parseMock.mockResolvedValueOnce({ output_parsed: low() }); return (await post()).body; }
function answerForm(clarification: { token: string; history: ClarificationAnswer[] }, answers: ClarificationAnswer[] = [{ id: 'hidden', notSure: false, answer: 'nothing else' }]) {
  const form = makeForm(); form.set('clarification', JSON.stringify({ token: clarification.token, history: clarification.history, answers })); return form;
}

describe('internal pricing and firm-quote separation', () => {
  it.each([73, 84, 85, 86])('allows supported internal pricing at %s with unchanged formula', async (confidencePercent) => {
    parseMock.mockResolvedValueOnce({ output_parsed: sampleAnalysis({ confidencePercent }) });
    const { body } = await post(); expect(canDisplayEstimate(body)).toBe(true);
    expect(body.pricing.suggestedQuote).toBe(priceJob(sampleInputs(), sampleAnalysis()).suggestedQuote);
    expect(body.firmQuoteEligible).toBe(confidencePercent >= 85); expect(Boolean(body.pricing.customerMessage)).toBe(confidencePercent >= 85);
    expect(body.estimateLabel).toContain('requires review before quoting');
    expect(body.analysisConfidence).toEqual({ score: confidencePercent, scale: '1-100', source: 'model_reported', calibrated: false });
  });
  it('shows provisional prices before and after low-score clarification without a firm quote', async () => {
    const initial = await begin(); expect(canDisplayEstimate(initial)).toBe(true); expect(initial.clarification.canSkip).toBe(true);
    parseMock.mockResolvedValueOnce({ output_parsed: low() });
    const { body } = await post(answerForm(initial.clarification));
    expect(canDisplayEstimate(body)).toBe(true); expect(body.pricing.customerMessage).toBeNull(); expect(body.clarification).toBeNull();
    expect(body.priceDrivers.find((d: { topic: string }) => d.topic === 'hidden').state).toBe('resolved');
  });
  it.each([{ visibleItems: [] }, { uncertaintyNotes: ['Cannot estimate total volume without item counts.'] }, { estimatedLoadCount: 3 }])('withholds unsupported scope %j', async (changes) => {
    vi.stubEnv('VERCEL_ENV', 'preview'); parseMock.mockResolvedValueOnce({ output_parsed: sampleAnalysis({ ...changes, warnings: ['$999 raw model quote'] }) });
    const { body } = await post(); expect(body.priceWithheld).toBe(true); expect(body.analysis).toBeNull(); expect(body.pricing).toBeNull();
    expect(body.firmQuoteEligible).toBe(false); expect(canDisplayEstimate(body)).toBe(false); expect(body.statusReasons.length).toBeGreaterThan(0);
    expect(JSON.stringify(body)).not.toMatch(/\$|customerMessage|suggestedQuote|recommendedRange|competitor/);
  });
  it('withholds unspecified additional scope instead of interpreting yes as no', async () => {
    const initial = await begin(); parseMock.mockResolvedValueOnce({ output_parsed: low() });
    const { body } = await post(answerForm(initial.clarification, [{ id: 'hidden', answer: 'yes', notSure: false }]));
    expect(body.pricing).toBeNull(); expect(body.statusReasons.join(' ')).toContain('quantity are unspecified'); expect(body.clarification.canSkip).toBe(false);
  });
  it('retains high-confidence heavy/labor/multi-load firm-quote safeguards', async () => {
    for (const change of [{ heavyDebrisRisk: 'high' as const }, { difficulty: 'hard' as const }, { estimatedLoadCount: 1.5 }]) {
      parseMock.mockResolvedValueOnce({ output_parsed: sampleAnalysis({ confidencePercent: 95, ...change }) });
      const { body } = await post(); expect(canDisplayEstimate(body)).toBe(true);
      expect(body.status).toBe('needs_manager_review'); expect(body.pricing.customerMessage).toBeNull();
    }
  });
  it('never releases a below-85 firm quote even with a lower configured threshold', async () => {
    vi.stubEnv('DIRECT_QUOTE_CONFIDENCE_THRESHOLD', '60');
    parseMock.mockResolvedValueOnce({ output_parsed: sampleAnalysis({ confidencePercent: 73 }) });
    const { body } = await post(); expect(canDisplayEstimate(body)).toBe(true); expect(body.firmQuoteEligible).toBe(false);
    expect(body.pricing.customerMessage).toBeNull();
  });
  it('defers inventory; unavailable readiness/payload does not block pricing', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview'); parseMock.mockResolvedValueOnce({ output_parsed: low() });
    const body = (await post()).body; expect(canDisplayEstimate(body)).toBe(true); expect(body.diagnostics.volume.status).toBe('unavailable');
    expect(body.diagnostics.volume.reasons.join(' ')).toContain('extraction is deferred'); expect(JSON.stringify(body.diagnostics)).not.toMatch(/\$|customerMessage|suggestedQuote/);
    expect(parseMock.mock.lastCall![0].text.format.schema.properties.shadow).toBeUndefined();
    vi.stubEnv('VERCEL_ENV', 'production'); vi.stubEnv('NODE_ENV', 'production'); parseMock.mockResolvedValueOnce({ output_parsed: sampleAnalysis() });
    expect((await post()).body.diagnostics).toBeUndefined();
  });
  it('withholds failures and invalid core analysis; signed retries still work', async () => {
    const initial = await begin(); parseMock.mockRejectedValueOnce(new Error('synthetic failure')); expect((await post(answerForm(initial.clarification))).body.pricing).toBeNull();
    parseMock.mockResolvedValueOnce({ output_parsed: sampleAnalysis() }); expect(canDisplayEstimate((await post(answerForm(initial.clarification))).body)).toBe(true);
    parseMock.mockResolvedValueOnce({ output_parsed: sampleAnalysis({ confidencePercent: 0.84 }) }); expect((await post()).body.status).toBe('analysis_failed');
  });
});

describe('brief answers, evidence and signed rounds', () => {
  it('maps answers by ID, resolves generic concerns, retains specific observations and unknown dimensions', () => {
    const answers: ClarificationAnswer[] = [{ id: 'hidden', answer: 'nothing else', notSure: false }, { id: 'contents', answer: 'lightweight decorations', notSure: false }, { id: 'dismantling', answer: 'no', notSure: false }, { id: 'dimensions', answer: '', notSure: true }];
    expect(reconcileClarificationFacts('', answers).map((f) => f.state)).toEqual(['resolved', 'resolved', 'resolved', 'unknown']);
    expect(normalizeClarificationAnswer(answers[2]).answer).toContain('No disassembly'); expect(reconcileClarificationFacts('', [answers[0]])[1].state).toBe('unknown');
    expect(normalizeClarificationAnswer({ id: 'contents', answer: 'no', notSure: false }).notSure).toBe(true);
    const analysis = sampleAnalysis({ warnings: ['Hidden items may exist.', 'Disassembly unknown.', 'Boxes may contain heavy items.'], heavyDebrisRisk: 'medium' });
    expect(clarificationQuestions(analysis, '', answers)).toEqual([]);
    const assessment = assessInternalEstimate(sampleInputs(), analysis, answers, 1); expect(assessment.drivers.every((d) => d.state === 'resolved')).toBe(true);
    expect(assessment.drivers.find((d) => d.topic === 'heavy')?.evidence.join(' ')).toContain('Model heavy flag');
    const observed = assessInternalEstimate(sampleInputs(), { ...analysis, observedFacts: ['Concrete blocks visible beside the boxes.'] }, answers, 1);
    expect(observed.drivers.find((d) => d.topic === 'heavy')?.state).toBe('review'); expect(observed.drivers.find((d) => d.topic === 'heavy')?.evidence.join(' ')).toContain('Concrete blocks');
  });
  it('limits questions to two, skips resolved topics and prioritizes previously unasked questions', () => {
    const analysis = sampleAnalysis({ questionsToAsk: ['Anything hidden?', 'What is inside boxes?', 'Disassembly?', 'Dimensions unclear?'] });
    expect(clarificationQuestions(analysis, '').map((q) => q.id)).toEqual(['hidden', 'contents']);
    expect(clarificationQuestions(analysis, '', [{ id: 'hidden', answer: '', notSure: true }, { id: 'contents', answer: 'blankets', notSure: false }]).map((q) => q.id)).toEqual(['dismantling', 'dimensions']);
    expect(clarificationQuestions(analysis, 'Nothing hidden. Boxes contain blankets. No disassembly required.').map((q) => q.id)).toEqual(['dimensions']);
  });
  it('binds optional second-round answers to original context and signed history', async () => {
    const initial = await begin(); parseMock.mockResolvedValueOnce({ output_parsed: sampleAnalysis({ confidencePercent: 73, questionsToAsk: ['Need disassembly?'] }) });
    const second = (await post(answerForm(initial.clarification))).body; expect(second.clarification.optional).toBe(true); expect(second.clarification.round).toBe(2);
    expect(second.clarification.history[0].answer).toBe('nothing else'); expect(canDisplayEstimate(second)).toBe(true);
    const answers: ClarificationAnswer[] = [{ id: 'dismantling', answer: 'no', notSure: false }];
    expect((await post(answerForm({ ...second.clarification, history: [] }, answers))).status).toBe(400); expect(parseMock).toHaveBeenCalledTimes(2);
    parseMock.mockResolvedValueOnce({ output_parsed: sampleAnalysis({ confidencePercent: 73, questionsToAsk: ['Anything hidden?', 'Need disassembly?'] }) });
    const final = (await post(answerForm(second.clarification, answers))).body; expect(final.clarification).toBeNull(); expect(canDisplayEstimate(final)).toBe(true);
    const calls = parseMock.mock.calls; expect(calls[2][0].input[0].content[0]).toEqual(calls[0][0].input[0].content[0]);
    expect(calls[2][0].input[0].content.at(-1)).toEqual(calls[0][0].input[0].content.at(-1));
    expect(calls[2][0].input[0].content[1].text).toContain('No disassembly or detachment'); expect(calls[2][0].input[0].content[1].text).toContain('No additional material');
  });
  it('Not sure remains unknown without blocking a supported internal estimate', async () => {
    const initial = await begin(); parseMock.mockResolvedValueOnce({ output_parsed: sampleAnalysis({ confidencePercent: 95 }) });
    const { body } = await post(answerForm(initial.clarification, [{ id: 'hidden', answer: '', notSure: true }]));
    expect(canDisplayEstimate(body)).toBe(true); expect(body.firmQuoteEligible).toBe(false); expect(body.status).toBe('needs_manager_review');
    expect(body.pricing.customerMessage).toBeNull(); expect(parseMock.mock.lastCall![0].input[0].content[1].text).toContain('Not sure');
  });
  it('stops after three signed rounds without silently releasing unresolved scope as a firm quote', async () => {
    let current = await begin();
    for (let round = 1; round <= 3; round++) {
      parseMock.mockResolvedValueOnce({ output_parsed: { ...low(), confidencePercent: 95 } });
      current = (await post(answerForm(current.clarification, [{ id: 'hidden', answer: '', notSure: true }]))).body;
      expect(canDisplayEstimate(current)).toBe(true); expect(current.firmQuoteEligible).toBe(false);
      expect(current.clarification?.round ?? null).toBe(round === 3 ? null : round + 1);
    }
  });
  it('rejects changed inputs, signatures, duplicate answers, expiry and changed photos', async () => {
    const initial = await begin();
    for (const mutate of [(form: FormData) => form.set('notes', 'changed original'), (form: FormData) => form.set('clarification', JSON.stringify({ token: 'forged', answers: [] })),
      (form: FormData) => { const data = JSON.parse(String(form.get('clarification'))); data.answers.push(data.answers[0]); form.set('clarification', JSON.stringify(data)); }
    ]) { const form = answerForm(initial.clarification); mutate(form); expect((await post(form)).status).toBe(400); }
    expect(parseMock).toHaveBeenCalledTimes(1); const validation = await validateEstimateForm(makeForm()); if (!validation.ok) throw new Error('Invalid fixture');
    const token = issueClarification(validation.value, clarificationQuestions(low(), ''), 1000); const raw = String(answerForm({ token, history: [] }).get('clarification'));
    expect(verifyClarification(raw, validation.value, 1001)).toHaveLength(1); expect(() => verifyClarification(raw, validation.value, 1801000)).toThrow();
    validation.value.photos[0].bytes[0] ^= 1; expect(() => verifyClarification(raw, validation.value, 1001)).toThrow();
  });
  it('labels score honestly; client rejects failed/withheld/legacy payloads', () => {
    expect(ANALYSIS_CONFIDENCE_LABEL).toBe('Uncalibrated analysis-confidence score'); expect(ANALYSIS_CONFIDENCE_NOTE).toContain('not a probability of price correctness');
    const result = { status: 'conditional_estimate' as const, estimateKind: 'provisional' as const, analysis: low(), pricing: priceJob(sampleInputs(), low()), inputs: sampleInputs() };
    expect(canDisplayEstimate(result)).toBe(true); expect(canDisplayEstimate({ ...result, priceWithheld: true })).toBe(false);
    expect(canDisplayEstimate({ ...result, status: 'analysis_failed' })).toBe(false); expect(canDisplayEstimate({ ...result, estimateKind: undefined })).toBe(false);
    expect(priceJob(sampleInputs(), low())).toEqual(priceJob(sampleInputs(), { ...low(), confidencePercent: 95 }));
  });
});
