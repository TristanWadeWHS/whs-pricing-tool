import { describe, expect, it } from 'vitest';
import { zodTextFormat } from 'openai/helpers/zod';
import { previewAnalysisSchema } from '../app/lib/analysis-schema';
import { reconcileClarificationFacts, factReviewIssues } from '../app/lib/clarification-facts';
import { unresolvedClarificationIssues } from '../app/lib/clarification';
import { calculateShadowVolume } from '../app/lib/shadow-volume';
import { buildReadiness, scoreReadiness } from '../app/lib/shadow-readiness';
import { safeShadowDiagnostics } from '../app/lib/shadow-diagnostics';
import { priceJob } from '../app/lib/pricing';
import { sampleAnalysis, sampleInputs } from './helpers';
import { dimensionNote, inventory, inventoryItem, tristanAnswers } from './shadow-inventory-fixtures';

describe('source-attributed reconciliation', () => {
  it('resolves the supplied scope, contents and disassembly without resolving dimensions', () => {
    const facts = reconcileClarificationFacts('', tristanAnswers);
    expect(facts.map((f) => [f.id, f.state])).toEqual([
      ['hidden', 'resolved'], ['contents', 'resolved'], ['dismantling', 'resolved'], ['dimensions', 'unknown']
    ]);
    expect(facts.every((f) => f.source === 'signed_clarification')).toBe(true);
    const issues = unresolvedClarificationIssues(sampleAnalysis({ confidencePercent: 73,
      questionsToAsk: ['Anything hidden?', 'What is inside boxes?', 'Need disassembly?', 'Dimensions unclear?'] }), '', tristanAnswers);
    expect(issues.join(' ')).toContain('Dimensions remains unconfirmed');
    expect(issues.join(' ')).not.toMatch(/Container contents remains|scope remains|Disassembly requirements remains/);
  });
  it('preserves unknowns and note attribution; only a specific linked contradiction changes a fact', () => {
    const base = { questionId: 'dismantling' as const, photoRef: 1, region: 'center' as const, kind: 'fastener_visible' as const,
      observation: 'A visible bolt joins the frame to the wall.', contradicts: 'No disassembly required.' };
    const facts = reconcileClarificationFacts('', tristanAnswers, [base], 1);
    expect(facts.find((f) => f.id === 'dismantling')?.state).toBe('conflicting');
    expect(factReviewIssues(facts, []).join(' ')).toContain('fastener visible in photo 1');
    for (const invalid of [{ ...base, photoRef: 2 }, { ...base, contradicts: 'Different answer' },
      { ...base, observation: 'Disassembly remains unclear?' }]) {
      expect(reconcileClarificationFacts('', tristanAnswers, [invalid], 1)[2].state).toBe('resolved');
    }
    expect(reconcileClarificationFacts('Boxes contain decorations.', [])[1].source).toBe('original_notes');
    expect(reconcileClarificationFacts('', [{ id: 'hidden', answer: 'Not sure', notSure: false }])[0].state).toBe('unknown');
  });
  it('does not silently replace contradictory original scope or disassembly facts', () => {
    const facts = reconcileClarificationFacts('No disassembly required.', [
      { id: 'dismantling', answer: 'Requires disassembly.', notSure: false }
    ]);
    expect(facts[2].state).toBe('conflicting');
    expect(facts[2].conflictWithOriginal).toBe(true);
  });
});

describe('deterministic volume', () => {
  it('calculates the synthetic two-crate example independently of price', () => {
    const result = calculateShadowVolume(inventory(), 2, dimensionNote);
    expect(result.status).toBe('available');
    expect(result.cubicYards?.min).toBeCloseTo(2);
    expect(result.cubicYards?.max).toBeCloseTo(8 / 3);
    expect(result.loadEquivalents?.min).toBeCloseTo(1 / 6);
    expect(result.loadEquivalents?.max).toBeCloseTo(2 / 9);
    expect(result.volumeOnlyTrips).toEqual({ min: 1, max: 1 });
    expect(result.weight.payloadEvidence).toBe('unavailable');
    const analysis = sampleAnalysis(); const original = priceJob(sampleInputs(), analysis);
    safeShadowDiagnostics(sampleInputs({ notes: dimensionNote }), { ...analysis, shadow: inventory() }, [], 2);
    expect(priceJob(sampleInputs(), analysis)).toEqual(original);
  });
  it.each([['in', 36], ['ft', 3], ['yd', 1], ['cm', 91.44], ['m', 0.9144]] as const)('converts %s to yards cubed', (unit, length) => {
    const item = inventoryItem({ quantity: 1 });
    item.dimensions = { ...item.dimensions!, length: { min: length, max: length }, width: { min: length, max: length },
      height: { min: length, max: length }, unit, evidence: { source: 'photo_estimate', excerpt: '' } };
    expect(calculateShadowVolume(inventory([item]), 1, dimensionNote).cubicYards?.max).toBeCloseTo(1);
  });
  it('merges repeated views, excludes constituents and rejects conflicting duplicate IDs', () => {
    const a = inventoryItem(); const otherView = { ...a, photoRefs: [2] };
    const child = inventoryItem({ id: 'contents', parentId: 'crates', dimensions: null, quantity: null });
    const result = calculateShadowVolume(inventory([a, otherView, child]), 2, dimensionNote);
    expect(result.cubicYards?.min).toBeCloseTo(2); expect(result.mergedViews).toBe(1); expect(result.omittedConstituents).toBe(1);
    expect(calculateShadowVolume(inventory([a, { ...otherView, quantity: 4 }]), 2, dimensionNote).status).toBe('unavailable');
  });
  it.each([
    { quantity: null }, { dimensions: null }, { overlap: 'uncertain' as const }, { photoRefs: [3] },
    { parentId: 'missing' }, { parentId: 'crates' }
  ])('abstains for unsupported input %j', (changes) => {
    expect(calculateShadowVolume(inventory([inventoryItem(changes)]), 2, dimensionNote).status).toBe('unavailable');
  });
  it('rejects reversed dimensions, fabricated provenance and unconfirmed compaction', () => {
    const item = inventoryItem(); item.dimensions!.length = { min: 4, max: 3 };
    expect(calculateShadowVolume(inventory([item]), 1, dimensionNote).status).toBe('unavailable');
    expect(calculateShadowVolume(inventory(), 1, '').status).toBe('unavailable');
    const wrongUnit = inventoryItem(); wrongUnit.dimensions!.unit = 'm';
    expect(calculateShadowVolume(inventory([wrongUnit]), 1, dimensionNote).status).toBe('unavailable');
    item.dimensions = inventoryItem().dimensions; item.dimensions!.state = 'after_disassembly';
    expect(calculateShadowVolume(inventory([item]), 1, dimensionNote).status).toBe('unavailable');
    item.dimensions!.state = 'as_is'; item.packing.basis = 'unknown';
    expect(calculateShadowVolume(inventory([item]), 1, dimensionNote).status).toBe('unavailable');
  });
  it('uses only explicitly supported bounded expansion, never a universal packing factor', () => {
    const item = inventoryItem(); const excerpt = 'Use packing factor 1.1 to 1.3 for these crates.';
    item.packing = { ...item.packing, basis: 'explicit_factor', factor: { min: 1.1, max: 1.3 }, evidence: { source: 'employee_report', excerpt } };
    const result = calculateShadowVolume(inventory([item]), 1, dimensionNote + excerpt);
    expect(result.cubicYards?.min).toBeCloseTo(2.2); expect(result.cubicYards?.max).toBeCloseTo(8 / 3 * 1.3);
    item.packing.factor = { min: 0.5, max: 1.3 };
    expect(calculateShadowVolume(inventory([item]), 1, dimensionNote + excerpt).status).toBe('unavailable');
  });
  it('flags dense/restricted material without inventing mass or payload', () => {
    const result = calculateShadowVolume(inventory([inventoryItem({ material: 'dense' }), inventoryItem({ id: 'restricted', material: 'restricted' })]), 1, dimensionNote);
    expect(result.weight).toEqual({ status: 'review_required', dense: true, restricted: true, payloadEvidence: 'unavailable' });
  });
});

describe('readiness, privacy and isolation', () => {
  it('scores applicable checks and renormalizes justified N/A, never missing data', () => {
    const result = scoreReadiness([
      { id: 'scope', label: 'Scope', checks: [{ label: 'A', state: 'resolved' }, { label: 'B', state: 'unknown' }] },
      { id: 'volume', label: 'Volume', checks: [{ label: 'A', state: 'conflicting' }] },
      { id: 'access', label: 'Access', checks: [{ label: 'A', state: 'not_applicable' }] }
    ]);
    expect(result.score).toBeCloseTo(100 * 25 / 55 * 0.5);
    expect(result.components.reduce((sum, c) => sum + c.effectiveWeight, 0)).toBeCloseTo(100);
    expect(scoreReadiness([{ id: 'scope', label: 'Scope', checks: [{ label: 'A', state: 'not_applicable' }] }]).score).toBeNull();
  });
  it('keeps blockers separate and never claims readiness is accuracy', () => {
    const result = buildReadiness(sampleInputs(), reconcileClarificationFacts('', tristanAnswers), inventory(), calculateShadowVolume(inventory(), 1, dimensionNote));
    expect(result.blockers.join(' ')).toContain('payload');
    expect(result.policy).toContain('Not pricing accuracy');
    expect(result.components.map((c) => c.weight)).toEqual([25, 20, 30, 15, 10]);
  });
  it('serializes no input excerpts, model IDs or prices and isolates thrown failures', () => {
    const result = safeShadowDiagnostics(sampleInputs({ notes: dimensionNote }), sampleAnalysis({ shadow: inventory([inventoryItem({ id: 'private-marker' })]) }), tristanAnswers, 1);
    expect(JSON.stringify(result)).not.toMatch(/private-marker|Christmas|Loaded crates|\$|suggestedQuote|customerMessage/);
    expect(safeShadowDiagnostics(sampleInputs(), sampleAnalysis(), [], 1, () => { throw new Error('sensitive'); })).toEqual({
      status: 'unavailable', reason: 'Shadow diagnostics unavailable; the existing estimate is unchanged.'
    });
  });
  it('can generate the strict structured-output schema without a model call', () => {
    const format = zodTextFormat(previewAnalysisSchema, 'synthetic_shadow');
    expect(format.type).toBe('json_schema');
    expect(format.strict).toBe(true);
  });
});
