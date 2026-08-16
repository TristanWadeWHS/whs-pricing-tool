import { JobInputs, PricingResult } from './pricing';
import { VisionAnalysis } from './analysis-schema';

export type QuoteStatus = 'analysis_failed' | 'needs_manager_review' | 'conditional_estimate' | 'direct_quote_eligible';

export type QuoteStatusResult = {
  status: QuoteStatus;
  threshold: number;
  reasons: string[];
};

export function getDirectQuoteConfidenceThreshold() {
  const raw = Number(process.env.DIRECT_QUOTE_CONFIDENCE_THRESHOLD || 85);
  if (!Number.isFinite(raw) || raw < 1 || raw > 100) {
    return 85;
  }
  return raw;
}

export function determineQuoteStatus(
  inputs: JobInputs,
  analysis: VisionAnalysis | null,
  options: { analysisFailed?: boolean; threshold?: number } = {}
): QuoteStatusResult {
  const threshold = options.threshold ?? getDirectQuoteConfidenceThreshold();

  if (options.analysisFailed || !analysis) {
    return {
      status: 'analysis_failed',
      threshold,
      reasons: ['AI photo analysis could not be completed. Manual review is required.']
    };
  }

  const reasons: string[] = [];
  const jobType = inputs.jobType.toLowerCase();

  if (analysis.confidencePercent < threshold) {
    reasons.push(`Confidence is below the provisional ${threshold}% direct-quote threshold.`);
  }
  if (analysis.photoAngleQuality === 'poor') {
    reasons.push('Photo quality is poor or ambiguous.');
  }
  if (analysis.heavyDebrisRisk === 'high') {
    reasons.push('Heavy, dense, demolition, or restricted material risk is high.');
  }
  if (analysis.hiddenDebrisRisk === 'high') {
    reasons.push('Hidden-debris uncertainty is high.');
  }
  if (analysis.difficulty === 'hard') {
    reasons.push('Labor or access difficulty is high.');
  }
  if (analysis.estimatedLoadPercent > 100 || analysis.estimatedLoadCount > 1) {
    reasons.push('The job may require more than one trailer load.');
  }
  if (jobType.includes('demo') || jobType.includes('concrete') || jobType.includes('dirt') || jobType.includes('appliance')) {
    reasons.push('The selected job type may require special handling or disposal review.');
  }
  if (analysis.warnings.length > 0 && analysis.hiddenDebrisRisk !== 'low') {
    reasons.push('Analysis warnings may materially affect price.');
  }

  if (reasons.some((reason) =>
    reason.includes('high') ||
    reason.includes('more than one trailer') ||
    reason.includes('special handling') ||
    reason.includes('poor')
  )) {
    return { status: 'needs_manager_review', threshold, reasons };
  }

  if (reasons.length > 0 || analysis.confidencePercent < threshold || analysis.hiddenDebrisRisk === 'medium' || analysis.heavyDebrisRisk === 'medium') {
    const conditionalReasons = reasons.length ? reasons : ['Some pricing assumptions should be confirmed before treating this as firm.'];
    return { status: 'conditional_estimate', threshold, reasons: conditionalReasons };
  }

  return {
    status: 'direct_quote_eligible',
    threshold,
    reasons: ['Meets provisional confidence and risk criteria for a direct quote.']
  };
}

export function buildCustomerMessage(pricing: PricingResult, status: QuoteStatus) {
  if (status === 'direct_quote_eligible') {
    return pricing.customerMessage;
  }

  if (status === 'conditional_estimate') {
    return `Based on the photos and details provided, the current estimate range is ${pricing.recommendedRange}. This is a conditional estimate pending confirmation that the visible material, access, and hidden-debris assumptions are accurate.`;
  }

  if (status === 'needs_manager_review') {
    return `Based on the photos and details provided, this job should be reviewed by a manager before sending a firm quote. The current internal estimate range is ${pricing.recommendedRange}, but the final quoted price may change after review.`;
  }

  return 'AI photo analysis could not be completed. Please retry or send this job for manual review before quoting.';
}

