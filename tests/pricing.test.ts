import { describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { loadedPercentRange, priceJob } from '../app/lib/pricing';
import { reconcilePricingFacts, coreLoadUnits } from '../app/lib/pricing-facts';
import { parseVisionAnalysis } from '../app/lib/analysis-schema';
import { validateEstimateForm } from '../app/lib/request-validation';
import { issueClarification, verifyClarification } from '../app/lib/clarification';
import { makeForm, pngFile, sampleAnalysis, sampleInputs } from './helpers';

const point = () => sampleAnalysis({ estimatedLoadPercent: 60, estimatedLoadRange: '60%', estimatedLoadCount: 0.6 });

describe('deterministic volume pricing', () => {
  it('prices 60% as $330 and keeps physical units consistent', () => {
    expect(priceJob(sampleInputs(), point())).toMatchObject({ volumeBasePrice: 330, baseLoadPrice: 330, adjustments: 0,
      suggestedQuote: 330, priceLow: 330, priceHigh: 330, recommendedRange: '$330', estimateBasis: 'model_load_point' });
    expect(coreLoadUnits(60)).toMatchObject({ cubicYards: 7.2, trailerEquivalents: 0.6 });
  });
  it('reproduces the old $420-$500 path using fixed synthetic evidence, then removes it', () => {
    const source = execFileSync('git', ['show', 'ae5f3e14d57081764fe8a3745bf8775647d1bcca:app/lib/pricing.ts'], { encoding: 'utf8' });
    const exports: { priceJob?: typeof priceJob } = {};
    runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
      { exports, require: () => ({ reconcilePricingFacts }) });
    const analysis = { ...point(), observedFacts: ['The item requires two people.'] };
    expect(exports.priceJob!(sampleInputs(), analysis)).toMatchObject({ baseLoadPrice: 330, adjustments: 125,
      suggestedQuote: 460, recommendedRange: '$420\u2013$500' });
    expect(priceJob(sampleInputs(), analysis)).toMatchObject({ adjustments: 0, suggestedQuote: 330, recommendedRange: '$330' });
  });
  it.each([['under25', 130], ['25to40', 145], ['40to65', 175]] as const)('uses %s minimum only when higher', (distanceTier, minimum) => {
    expect(priceJob(sampleInputs({ distanceTier }), { ...point(), estimatedLoadPercent: 1 }).suggestedQuote).toBe(minimum);
    expect(priceJob(sampleInputs({ distanceTier }), point()).suggestedQuote).toBe(330);
  });
  it('ignores model confidence, risk, handling, difficulties, dollars and actual crew', () => {
    const baseline = priceJob(sampleInputs(), point());
    const model = { ...point(), confidencePercent: 1, heavyDebrisRisk: 'high' as const, hiddenDebrisRisk: 'high' as const,
      difficulty: 'hard' as const, observedFacts: ['Requires two people.', 'One person needs a dolly.'], suggestedQuote: 9999, price: 9999 };
    expect(priceJob(sampleInputs({ workers: 6, notes: 'Requires two people.' }), model)).toEqual(baseline);
    expect(parseVisionAnalysis(model).success).toBe(false);
    expect(priceJob(sampleInputs({ jobType: 'cardboard only' }), point())).toEqual(baseline);
  });
  it('requires explicit approval and itemizes only matching existing access rules', () => {
    const inputs = sampleInputs({ carryDistance: 'long', stairs: 'heavy' });
    expect(priceJob(inputs, point()).suggestedQuote).toBe(330);
    const approved = priceJob({ ...inputs, staffAddOns: ['carry_long'] }, point());
    expect(approved).toMatchObject({ baseLoadPrice: 330, adjustments: 90, suggestedQuote: 420,
      lineItems: [{ id: 'carry_long', label: 'Long carry', amount: 90 }] });
    expect(approved.adjustmentNotes).toEqual(['Staff-approved Long carry: +$90']);
    for (const staffAddOns of [['heavy_high'], ['carry_medium'], ['carry_long', 'carry_long'], ['9999']]) {
      expect(() => priceJob({ ...inputs, staffAddOns }, point())).toThrow('Invalid staff-approved');
    }
  });
  it('maps a genuine percentage range with the same minimum and approved add-on at both endpoints', () => {
    expect(priceJob(sampleInputs(), { ...point(), estimatedLoadRange: '50-70% of a 12-yard trailer' }))
      .toMatchObject({ suggestedQuote: 330, priceLow: 275, priceHigh: 385, recommendedRange: '$275\u2013$385' });
    expect(priceJob(sampleInputs({ carryDistance: 'medium', staffAddOns: ['carry_medium'] }),
      { ...point(), estimatedLoadPercent: 20, estimatedLoadRange: '10% to 30%' }))
      .toMatchObject({ priceLow: 170, priceHigh: 205, suggestedQuote: 170 });
    expect(priceJob(sampleInputs(), { ...point(), estimatedLoadPercent: 55, estimatedLoadRange: '55%' }).suggestedQuote).toBe(302.5);
  });
  it.each(['60%', 'about half', '$420-$500', '0.5-0.7 loads', '6-8 cubic yards', '70-50%', '50-70', '50-250%', '1-20%', '50-70% or 90-100%', '50-70% confidence'])('does not invent endpoints from %s', (text) => {
    expect(loadedPercentRange(text, 60)).toBeNull();
    expect(priceJob(sampleInputs(), { ...point(), estimatedLoadRange: text }).recommendedRange).toBe('$330');
  });
  it.each([0, -1, 201, NaN, Infinity, undefined, '60'])('fails closed for invalid percentage %s', (value) => {
    expect(() => priceJob(sampleInputs(), { ...point(), estimatedLoadPercent: value } as never)).toThrow('valid estimated load percent');
  });
  it('validates add-on transport and binds approval to signed clarification context', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'synthetic-test-only');
    try {
      const form = makeForm({ carryDistance: 'long' }); form.append('staffAddOn', 'carry_long');
      const first = await validateEstimateForm(form); expect(first.ok).toBe(true); if (!first.ok) return;
      expect(first.value.inputs.staffAddOns).toEqual(['carry_long']);
      const token = issueClarification(first.value, [{ id: 'contents', text: 'What is inside?' }]);
      const payload = JSON.stringify({ token, answers: [{ id: 'contents', answer: 'lightweight decorations', notSure: false }] });
      expect(verifyClarification(payload, first.value)).toBeTruthy();
      form.delete('staffAddOn'); const altered = await validateEstimateForm(form); if (!altered.ok) throw new Error('Invalid fixture');
      expect(() => verifyClarification(payload, altered.value)).toThrow();
      for (const value of ['carry_medium', 'heavy_high', '', pngFile()]) {
        form.set('staffAddOn', value); expect((await validateEstimateForm(form)).ok).toBe(false);
      }
      form.set('staffAddOn', 'carry_long'); form.append('staffAddOn', 'carry_long'); expect((await validateEstimateForm(form)).ok).toBe(false);
    } finally { vi.unstubAllEnvs(); }
  });
});
