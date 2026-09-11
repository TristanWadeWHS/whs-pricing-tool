import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeForm, sampleAnalysis, sampleInputs } from './helpers';
import { clarificationQuestions, issueClarification, verifyClarification } from '../app/lib/clarification';
import { validateEstimateForm } from '../app/lib/request-validation';
const parseMock = vi.hoisted(() => vi.fn());
vi.mock('openai', () => ({ default: vi.fn(function () { return { responses: { parse: parseMock } }; }) }));
import { POST } from '../app/api/analyze/route';

afterEach(() => { vi.unstubAllEnvs(); parseMock.mockReset(); });
const low = () => sampleAnalysis({ confidencePercent: 84, questionsToAsk: ['Anything hidden?'], uncertaintyNotes: ['Hidden items unclear'], warnings: ['$999 must never escape before clarification'] });
async function post(form = makeForm()) {
  vi.stubEnv('OPENAI_API_KEY', 'synthetic-server-only-key');
  const response = await POST(new Request('http://localhost/api/analyze', { method: 'POST', body: form }) as never);
  return { status: response.status, body: await response.json() };
}
async function begin() { parseMock.mockResolvedValueOnce({ output_parsed: low() }); return (await post()).body; }
function answerForm(token: string, notSure = false) {
  const form = makeForm();
  form.set('clarification', JSON.stringify({ token, answers: [{ id: 'hidden', notSure, answer: notSure ? '' : 'Only the visible items need removal.' }] }));
  return form;
}

describe('server-enforced clarification', () => {
  it.each([84, 85, 86])('handles confidence %s on the schema percent scale', async (confidencePercent) => {
    parseMock.mockResolvedValue({ output_parsed: { ...low(), confidencePercent, warnings: [] } });
    const { body } = await post();
    expect(body.status).toBe(confidencePercent < 85 ? 'clarification_required' : 'direct_quote_eligible');
    expect(Boolean(body.pricing)).toBe(confidencePercent >= 85);
  });
  it('returns only fixed questions/status and an opaque context binding before pricing', async () => {
    const body = await begin();
    expect(body.analysis).toBeNull(); expect(body.pricing).toBeNull(); expect(body.inputs).toBeNull();
    expect(JSON.stringify(body)).not.toMatch(/\$|customerMessage|suggestedQuote|recommendedRange|competitor/);
    expect(body.clarification.questions).toHaveLength(1);
  });
  it('reassesses original photos/details plus validated answers', async () => {
    const initial = await begin();
    parseMock.mockResolvedValueOnce({ output_parsed: sampleAnalysis({ confidencePercent: 90 }) });
    const { body } = await post(answerForm(initial.clarification.token));
    expect(body.status).toBe('direct_quote_eligible');
    const first = parseMock.mock.calls[0][0].input[0].content;
    const second = parseMock.mock.calls[1][0].input[0].content;
    expect(second[0]).toEqual(first[0]);
    expect(second.filter((part) => part.type === 'input_image')).toEqual(first.filter((part) => part.type === 'input_image'));
    expect(second[1].text).toContain('Only the visible items need removal.');
    expect(second[1].text).toContain('untrusted employee-provided data');
  });
  it.each([{ confidence: 84, notSure: false }, { confidence: 95, notSure: true }])('requires review after unresolved clarification: %j', async ({ confidence, notSure }) => {
    const initial = await begin();
    parseMock.mockResolvedValueOnce({ output_parsed: sampleAnalysis({ confidencePercent: confidence }) });
    const { body } = await post(answerForm(initial.clarification.token, notSure));
    expect(body.status).toBe('needs_manager_review');
    expect(body.clarification).toBeUndefined();
    expect(body.analysis.confidencePercent).toBe(confidence);
    expect(body.pricing.customerMessage).toContain('before sending a firm quote');
    if (notSure) expect(parseMock.mock.calls[1][0].input[0].content[1].text).toContain('Not sure');
  });
  it('requires unpriced review if no actionable unanswered question exists', async () => {
    parseMock.mockResolvedValue({ output_parsed: sampleAnalysis({ confidencePercent: 70, questionsToAsk: ['How many stairs?'], warnings: ['Poor image quality.'] }) });
    const { body } = await post();
    expect(body.status).toBe('needs_manager_review'); expect(body.pricing).toBeNull(); expect(body.analysis).toBeNull();
  });
  it('retains high-confidence safety review rules', async () => {
    parseMock.mockResolvedValue({ output_parsed: sampleAnalysis({ confidencePercent: 95, heavyDebrisRisk: 'high' }) });
    expect((await post()).body.status).toBe('needs_manager_review');
  });
  it('rejects tampering, missing/duplicate answers and changed context before model use', async () => {
    const initial = await begin();
    for (const mutate of [
      (form: FormData) => form.set('notes', 'changed original job'),
      (form: FormData) => form.set('clarification', JSON.stringify({ token: 'forged', answers: [] })),
      (form: FormData) => { const data = JSON.parse(String(form.get('clarification'))); data.answers.push(data.answers[0]); form.set('clarification', JSON.stringify(data)); }
    ]) {
      const form = answerForm(initial.clarification.token); mutate(form);
      const result = await post(form); expect(result.status).toBe(400); expect(result.body.pricing).toBeNull();
    }
    expect(parseMock).toHaveBeenCalledTimes(1);
  });
  it('returns no price on reassessment failure; token remains retryable within expiry', async () => {
    const initial = await begin();
    parseMock.mockRejectedValueOnce(new Error('synthetic provider failure'));
    expect((await post(answerForm(initial.clarification.token))).body.pricing).toBeNull();
    parseMock.mockResolvedValueOnce({ output_parsed: sampleAnalysis() });
    expect((await post(answerForm(initial.clarification.token))).body.pricing).not.toBeNull();
  });
  it('does not reinterpret an invalid fractional percent as high confidence', async () => {
    parseMock.mockResolvedValueOnce({ output_parsed: sampleAnalysis({ confidencePercent: 0.84 }) });
    expect((await post()).body.status).toBe('analysis_failed');
  });
});

describe('question selection and token expiry', () => {
  it('deduplicates scope topics and skips structured/explicitly answered questions', () => {
    const analysis = { ...low(), questionsToAsk: ['Hidden?', 'Anything underneath?', 'Stairs?', 'What is inside boxes?'] };
    expect(clarificationQuestions(analysis, '').map((q) => q.id)).toEqual(['hidden', 'contents']);
    expect(clarificationQuestions(analysis, 'Nothing hidden. Boxes contain blankets.')).toEqual([]);
    expect(sampleInputs().stairs).toBe('none');
  });
  it('expires tickets and rejects altered photo bytes', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'synthetic-server-only-key');
    const validation = await validateEstimateForm(makeForm());
    if (!validation.ok) throw new Error('Invalid fixture');
    const questions = clarificationQuestions(low(), '');
    const token = issueClarification(validation.value, questions, 1000);
    const raw = String(answerForm(token).get('clarification'));
    expect(verifyClarification(raw, validation.value, 1001)).toHaveLength(1);
    expect(() => verifyClarification(raw, validation.value, 1801000)).toThrow();
    validation.value.photos[0].bytes[0] ^= 1;
    expect(() => verifyClarification(raw, validation.value, 1001)).toThrow();
  });
});
