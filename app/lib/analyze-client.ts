import { IMAGE_TOO_LARGE_MESSAGE } from './estimate-limits';
import type { ShadowDiagnostics } from './shadow-diagnostics';
import type { ClarificationAnswer } from './clarification';
import type { PriceDriver } from './internal-estimate';

export type Result = {
  diagnostics?: ShadowDiagnostics;
  status?: 'analysis_failed' | 'needs_manager_review' | 'conditional_estimate' | 'direct_quote_eligible' | 'clarification_required';
  clarification?: { token: string; questions: Array<{ id: string; text: string }>; history: ClarificationAnswer[];
    round: number; optional: boolean; canSkip: boolean } | null;
  estimateKind?: 'provisional' | 'quote_candidate' | 'withheld';
  firmQuoteEligible?: boolean;
  estimateLabel?: string;
  assumptions?: string[];
  priceDrivers?: PriceDriver[];
  priceWithheld?: boolean;
  analysisConfidence?: { score: number; scale: '1-100'; source: 'model_reported'; calibrated: false };
  statusReasons?: string[];
  confidenceThreshold?: number;
  analysis: any;
  pricing: any;
  inputs: any;
  error?: string;
  errorCode?: string;
};

export function canDisplayEstimate(result: Result | null) {
  const score = result?.analysis?.confidencePercent;
  return Boolean(result?.analysis && result?.pricing && !result.priceWithheld && result.status !== 'analysis_failed'
    && (result.estimateKind === 'provisional' || result.estimateKind === 'quote_candidate')
    && typeof score === 'number' && Number.isFinite(score) && score >= 1 && score <= 100
    && Number.isFinite(result.pricing.suggestedQuote) && typeof result.pricing.recommendedRange === 'string');
}

export function failedResult(error: string, errorCode: string): Result {
  return {
    status: 'analysis_failed',
    error,
    errorCode,
    analysis: null,
    pricing: null,
    inputs: null
  };
}

export async function readAnalyzeResponse(res: Response): Promise<Result> {
  const contentType = res.headers.get('content-type') || '';

  if (!contentType.toLowerCase().includes('application/json')) {
    return failedResult(messageForNonJsonStatus(res.status), codeForNonJsonStatus(res.status));
  }

  try {
    return await res.json();
  } catch {
    return failedResult('The estimate response could not be read. Manual review is required.', 'invalid_json_response');
  }
}

function messageForNonJsonStatus(status: number) {
  if (status === 413) {
    return IMAGE_TOO_LARGE_MESSAGE;
  }

  if (status === 401 || status === 403) {
    return 'Your internal access session may have expired. Refresh the page, sign in again, and retry the estimate.';
  }

  if (status >= 500) {
    return 'The analysis service is temporarily unavailable. Manual review is required.';
  }

  return 'The estimate request could not be completed. Manual review is required.';
}

function codeForNonJsonStatus(status: number) {
  if (status === 413) {
    return 'request_too_large';
  }

  if (status === 401 || status === 403) {
    return 'unauthorized';
  }

  if (status >= 500) {
    return 'infrastructure_error';
  }

  return 'non_json_response';
}
