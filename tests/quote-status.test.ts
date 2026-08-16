import { describe, expect, it } from 'vitest';
import { buildCustomerMessage, determineQuoteStatus } from '../app/lib/quote-status';
import { priceJob } from '../app/lib/pricing';
import { sampleAnalysis, sampleInputs } from './helpers';

describe('quote status policy', () => {
  it('allows a high-confidence ordinary job to be direct-quote eligible', () => {
    const result = determineQuoteStatus(sampleInputs(), sampleAnalysis({ confidencePercent: 90 }), { threshold: 85 });
    expect(result.status).toBe('direct_quote_eligible');
  });

  it('makes confidence immediately below threshold conditional', () => {
    const result = determineQuoteStatus(sampleInputs(), sampleAnalysis({ confidencePercent: 84 }), { threshold: 85 });
    expect(result.status).toBe('conditional_estimate');
  });

  it('requires manager review for poor photos, high heavy risk, high hidden risk, hard difficulty, demolition, or multi-load jobs', () => {
    expect(determineQuoteStatus(sampleInputs(), sampleAnalysis({ photoAngleQuality: 'poor' })).status).toBe('needs_manager_review');
    expect(determineQuoteStatus(sampleInputs(), sampleAnalysis({ heavyDebrisRisk: 'high' })).status).toBe('needs_manager_review');
    expect(determineQuoteStatus(sampleInputs(), sampleAnalysis({ hiddenDebrisRisk: 'high' })).status).toBe('needs_manager_review');
    expect(determineQuoteStatus(sampleInputs(), sampleAnalysis({ difficulty: 'hard' })).status).toBe('needs_manager_review');
    expect(determineQuoteStatus(sampleInputs({ jobType: 'demo debris' }), sampleAnalysis()).status).toBe('needs_manager_review');
    expect(determineQuoteStatus(sampleInputs(), sampleAnalysis({ estimatedLoadPercent: 125, estimatedLoadCount: 1.25 })).status).toBe('needs_manager_review');
  });

  it('returns analysis_failed without analysis', () => {
    expect(determineQuoteStatus(sampleInputs(), null, { analysisFailed: true }).status).toBe('analysis_failed');
  });

  it('does not present conditional or review messages as firm quotes', () => {
    const pricing = priceJob(sampleInputs(), sampleAnalysis());
    expect(buildCustomerMessage(pricing, 'conditional_estimate')).toContain('conditional estimate');
    expect(buildCustomerMessage(pricing, 'needs_manager_review')).toContain('reviewed by a manager');
    expect(buildCustomerMessage(pricing, 'analysis_failed')).not.toContain(`$${pricing.suggestedQuote}`);
  });
});

