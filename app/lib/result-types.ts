export type Result = {
  status?: 'analysis_failed' | 'needs_manager_review' | 'conditional_estimate' | 'direct_quote_eligible';
  statusReasons?: string[];
  confidenceThreshold?: number;
  analysis: any;
  pricing: any;
  inputs: any;
  error?: string;
};
