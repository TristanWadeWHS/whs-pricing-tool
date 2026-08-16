import type { Result } from './result-types';

export const ACCESS_EXPIRED_ERROR = 'Your internal access session may have expired. Refresh the page, sign in again, and retry the estimate.';
export const UPLOAD_TOO_LARGE_ERROR = 'The selected photos are too large to submit. Use smaller images and try again.';
export const UNEXPECTED_ANALYZE_RESPONSE_ERROR = 'The estimate request could not be completed. Manual review is required.';

export async function parseAnalyzeResponse(response: Response): Promise<Result> {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.toLowerCase().includes('application/json')) {
    return response.json() as Promise<Result>;
  }

  if (response.status === 401 || response.status === 403) {
    return analysisFailed(ACCESS_EXPIRED_ERROR);
  }

  if (response.status === 413) {
    return analysisFailed(UPLOAD_TOO_LARGE_ERROR);
  }

  return analysisFailed(UNEXPECTED_ANALYZE_RESPONSE_ERROR);
}

export function analysisFailed(error: string): Result {
  return {
    status: 'analysis_failed',
    error,
    analysis: null,
    pricing: null,
    inputs: null
  };
}
