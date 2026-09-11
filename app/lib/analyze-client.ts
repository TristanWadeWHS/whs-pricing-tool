import { IMAGE_TOO_LARGE_MESSAGE } from './estimate-limits';

export type Result = {
  status?: 'analysis_failed' | 'needs_manager_review' | 'conditional_estimate' | 'direct_quote_eligible' | 'clarification_required';
  clarification?: { token: string; questions: Array<{ id: string; text: string }> };
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
  return Boolean(result?.analysis && result?.pricing && !result.priceWithheld && result.status !== 'clarification_required'
    && typeof score === 'number' && Number.isFinite(score) && score >= 85 && score <= 100
    && (!result.analysisConfidence || result.analysisConfidence.score >= 85));
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
