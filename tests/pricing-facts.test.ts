import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { sampleInputs, sampleAnalysis } from './helpers';
import { coreLoadUnits, reconcilePricingFacts } from '../app/lib/pricing-facts';
import { priceJob } from '../app/lib/pricing';
import { assessInternalEstimate } from '../app/lib/internal-estimate';

const regressionNotes = 'Side-yard household junk. All items are easily carried by one person. Boxes contain lightweight household goods. Nothing hidden. All shown items included. No disassembly required.';
const fixed = () => sampleAnalysis({ estimatedLoadPercent: 55, estimatedLoadCount: 0.55, heavyDebrisRisk: 'medium', hiddenDebrisRisk: 'medium', difficulty: 'medium',
  observedFacts: ['Closed boxes in a pile.'], uncertaintyNotes: ['Contents may be heavy.', 'Additional material possibly hidden.'], assumptions: ['Loaded volume is already compacted.'] });

describe('WHS evidence-based Preview adjustments', () => {
  it('prices the fixed 55% side-yard regression without generic surcharges', () => {
    const inputs = sampleInputs({ notes: regressionNotes }); const analysis = fixed(); const facts = reconcilePricingFacts(inputs, analysis);
    expect(facts.handling.level).toBe('low'); expect(facts.hidden.state).toBe('resolved'); expect(facts.labor.state).toBe('routine_included');
    const pricing = priceJob(inputs, analysis, facts);
    expect(pricing.baseLoadPrice).toBe(248); expect(pricing.adjustments).toBe(0); expect(pricing.suggestedQuote).toBe(255);
    expect(pricing.recommendedRange).toBe('$215–$295'); expect(pricing.adjustmentNotes).toEqual([]);
    expect(facts.load).toEqual({ percent: 55, cubicYards: 6.6, trailerEquivalents: 0.55, volumeOnlyTrips: 1, trailerCubicYards: 12 });
  });
  it('compares the exact preserved pricing code and new policy with identical synthetic inputs', () => {
    const source = execFileSync('git', ['show', 'd7a26ec90dcccba681fc68c415d499b0d2d8fd64:app/lib/pricing.ts'], { encoding: 'utf8' });
    const exports: { priceJob?: typeof priceJob } = {};
    runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports });
    const inputs = sampleInputs({ notes: regressionNotes }); const analysis = fixed();
    const before = exports.priceJob!(inputs, analysis); const after = priceJob(inputs, analysis);
    expect(before.baseLoadPrice).toBe(after.baseLoadPrice); expect(before.adjustments).toBe(120);
    expect(before.recommendedRange).toBe('$335–$415'); expect(before.suggestedQuote).toBe(375);
    expect(before.suggestedQuote - after.suggestedQuote).toBe(120);
  });
  it.each([
    ['One person can move the item but needs a dolly.', 'medium', 50],
    ['The item requires two or more people to lift safely.', 'high', 125],
    ['One person carries all items easily.', 'low', 0],
    ['Closed boxes; a sofa; a dense pile.', 'unknown', 0],
    ['One person might need a dolly.', 'unknown', 0],
    ['One person can carry easily without a dolly.', 'low', 0],
    ['The item does not require two people.', 'unknown', 0]
  ])('uses handling evidence: %s', (notes, level, adjustment) => {
    const inputs = sampleInputs({ notes }); const analysis = sampleAnalysis({ heavyDebrisRisk: 'high' });
    expect(reconcilePricingFacts(inputs, analysis).handling.level).toBe(level); expect(priceJob(inputs, analysis).adjustments).toBe(adjustment);
  });
  it('does not stack repeated medium/high handling observations or access-only handling', () => {
    const inputs = sampleInputs({ notes: 'One person needs a dolly. One person needs a dolly. The cabinet requires two people.', carryDistance: 'long', stairs: 'some' });
    expect(priceJob(inputs, fixed()).adjustments).toBe(125 + 90 + 40);
    const accessOnly = sampleInputs({ notes: 'One person needs a dolly due to long carry. Two people are required on stairs.', carryDistance: 'long', stairs: 'some' });
    expect(priceJob(accessOnly, fixed()).adjustments).toBe(90 + 40);
  });
  it('uses actual answer evidence, not contents names or unknown answers, and retains contradictions for review', () => {
    const inputs = sampleInputs(); const analysis = fixed();
    const answers = [{ id: 'contents' as const, answer: 'Lightweight household goods; one person carries all items easily.', notSure: false },
      { id: 'hidden' as const, answer: 'nothing else', notSure: false }, { id: 'dismantling' as const, answer: 'no', notSure: false }];
    const assessed = assessInternalEstimate(inputs, analysis, answers, 1);
    expect(assessed.pricingFacts.handling.level).toBe('low'); expect(assessed.pricingFacts.hidden.state).toBe('resolved');
    expect(priceJob(inputs, analysis, assessed.pricingFacts).adjustments).toBe(0);
    const uncertain = reconcilePricingFacts(inputs, analysis, [{ id: 'contents', answer: '', notSure: true }, { id: 'hidden', answer: '', notSure: true }]);
    expect(uncertain.handling.level).toBe('unknown'); expect(uncertain.hidden.state).toBe('unknown'); expect(priceJob(inputs, analysis, uncertain).adjustments).toBe(0);
    const contradicted = reconcilePricingFacts(inputs, { ...analysis, observedFacts: ['A fixed frame requires two people to lift.'] }, answers);
    expect(contradicted.handling.level).toBe('conflicting'); expect(priceJob(inputs, analysis, contradicted).adjustments).toBe(0);
    expect(contradicted.reviewReasons.join(' ')).toContain('conflicts');
    const hiddenConflict = assessInternalEstimate(inputs, { ...analysis, observedFacts: ['Additional bags are visible underneath the pile.'] }, answers, 1);
    expect(hiddenConflict.essentialReasons.join(' ')).toContain('conflicts');
  });
  it('keeps substantial demolition and repeated long-distance movement out of generic fees', () => {
    const inputs = sampleInputs({ notes: 'Requires substantial demolition. Repeated long-distance movement of debris.', carryDistance: 'long' });
    const facts = reconcilePricingFacts(inputs, fixed()); expect(facts.labor.state).toBe('exceptional_review');
    expect(facts.reviewReasons.join(' ')).toContain('no approved task-specific rate'); expect(priceJob(inputs, fixed(), facts).adjustments).toBe(90);
    expect(reconcilePricingFacts(sampleInputs({ notes: 'No substantial demolition. Ordinary packing and lifting.' }), fixed()).labor.state).toBe('routine_included');
  });
  it('keeps material hazards separate and never charges from names alone', () => {
    const facts = reconcilePricingFacts(sampleInputs(), sampleAnalysis({ observedFacts: ['Concrete blocks visible in the pile.'] }));
    expect(facts.handling.level).toBe('unknown'); expect(facts.hazards).toHaveLength(1);
    expect(facts.reviewReasons.join(' ')).toContain('Material/disposal');
  });
  it.each([10, 55, 100, 155, 200])('derives consistent units without applying another packing discount: %s', (percent) => {
    const units = coreLoadUnits(percent); expect(units.trailerEquivalents).toBe(percent / 100);
    expect(units.cubicYards).toBeCloseTo(percent / 100 * 12); expect(units.volumeOnlyTrips).toBe(Math.ceil(percent / 100));
    expect(priceJob(sampleInputs(), sampleAnalysis({ estimatedLoadPercent: percent, assumptions: ['Already compacted.'] })).baseLoadPrice)
      .toBe(Math.max(130, Math.round(percent / 100 * 450)));
  });
});
