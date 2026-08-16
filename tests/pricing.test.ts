import { describe, expect, it } from 'vitest';
import { priceJob } from '../app/lib/pricing';
import { sampleAnalysis, sampleInputs } from './helpers';

describe('priceJob regression baseline', () => {
  it('enforces the under-25-mile minimum', () => {
    const pricing = priceJob(sampleInputs(), sampleAnalysis({ estimatedLoadPercent: 10 }));
    expect(pricing.minimumPrice).toBe(130);
    expect(pricing.baseLoadPrice).toBe(130);
    expect(pricing.suggestedQuote).toBe(155);
  });

  it('uses each distance tier minimum', () => {
    expect(priceJob(sampleInputs({ distanceTier: 'under25' }), sampleAnalysis({ estimatedLoadPercent: 10 })).minimumPrice).toBe(130);
    expect(priceJob(sampleInputs({ distanceTier: '25to40' }), sampleAnalysis({ estimatedLoadPercent: 10 })).minimumPrice).toBe(145);
    expect(priceJob(sampleInputs({ distanceTier: '40to65' }), sampleAnalysis({ estimatedLoadPercent: 10 })).minimumPrice).toBe(175);
  });

  it('calculates fractional, full, and multi-load base prices from the existing linear formula', () => {
    expect(priceJob(sampleInputs(), sampleAnalysis({ estimatedLoadPercent: 50 })).baseLoadPrice).toBe(225);
    expect(priceJob(sampleInputs(), sampleAnalysis({ estimatedLoadPercent: 100 })).baseLoadPrice).toBe(450);
    expect(priceJob(sampleInputs(), sampleAnalysis({ estimatedLoadPercent: 200, estimatedLoadCount: 2 })).baseLoadPrice).toBe(900);
  });

  it('keeps cardboard behavior unchanged', () => {
    const pricing = priceJob(sampleInputs({ jobType: 'cardboard only' }), sampleAnalysis({ estimatedLoadPercent: 50 }));
    expect(pricing.adjustments).toBe(-40);
    expect(pricing.adjustmentNotes).toContain('Cardboard-only discount applied');
  });

  it('keeps difficulty, heavy-material, hidden-debris, carry, and stairs adjustments unchanged', () => {
    const pricing = priceJob(
      sampleInputs({ carryDistance: 'long', stairs: 'heavy' }),
      sampleAnalysis({ heavyDebrisRisk: 'high', hiddenDebrisRisk: 'high', difficulty: 'hard' })
    );
    expect(pricing.adjustments).toBe(500);
  });

  it('does not use worker count in the current pricing formula', () => {
    const oneWorker = priceJob(sampleInputs({ workers: 1 }), sampleAnalysis());
    const sixWorkers = priceJob(sampleInputs({ workers: 6 }), sampleAnalysis());
    expect(sixWorkers.suggestedQuote).toBe(oneWorker.suggestedQuote);
  });

  it('clamps load percentage boundaries to the existing 10-200 range', () => {
    expect(priceJob(sampleInputs(), sampleAnalysis({ estimatedLoadPercent: 0 })).baseLoadPrice).toBe(225);
    expect(priceJob(sampleInputs(), sampleAnalysis({ estimatedLoadPercent: 250, estimatedLoadCount: 2.5 })).baseLoadPrice).toBe(900);
  });
});
