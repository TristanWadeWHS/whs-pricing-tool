export const ANALYSIS_CONFIDENCE_LABEL = 'Uncalibrated analysis-confidence score';
export const ANALYSIS_CONFIDENCE_NOTE = 'GPT-reported assessment, not a probability of price correctness. The 85/100 cutoff is a workflow rule, not measured accuracy.';

export function analysisConfidence(score: number) {
  return { score, scale: '1-100' as const, source: 'model_reported' as const, calibrated: false as const };
}
