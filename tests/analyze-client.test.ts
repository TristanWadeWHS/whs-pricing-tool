import { describe, expect, it } from 'vitest';
import { failedResult, readAnalyzeResponse } from '../app/lib/analyze-client';
import { IMAGE_TOO_LARGE_MESSAGE } from '../app/lib/estimate-limits';
import { sampleAnalysis } from './helpers';

describe('analyze response handling', () => {
  it('preserves valid JSON analysis and pricing responses', async () => {
    const body = {
      status: 'direct_quote_eligible',
      analysis: sampleAnalysis(),
      pricing: { suggestedQuote: 250 },
      inputs: { distanceTier: 'under25' }
    };

    await expect(readAnalyzeResponse(Response.json(body))).resolves.toEqual(body);
  });

  it('surfaces non-JSON 413 infrastructure responses as actionable upload guidance', async () => {
    const response = new Response('Payload Too Large', {
      status: 413,
      headers: { 'content-type': 'text/plain; charset=utf-8' }
    });

    await expect(readAnalyzeResponse(response)).resolves.toMatchObject({
      status: 'analysis_failed',
      error: IMAGE_TOO_LARGE_MESSAGE,
      errorCode: 'request_too_large',
      analysis: null,
      pricing: null
    });
  });

  it('surfaces auth responses without exposing internals', async () => {
    const response = new Response('Unauthorized', {
      status: 401,
      headers: { 'content-type': 'text/plain; charset=utf-8' }
    });

    await expect(readAnalyzeResponse(response)).resolves.toMatchObject({
      status: 'analysis_failed',
      errorCode: 'unauthorized'
    });
  });

  it('surfaces non-JSON infrastructure 5xx responses without crashing', async () => {
    const response = new Response('<html>Bad Gateway</html>', {
      status: 502,
      headers: { 'content-type': 'text/html; charset=utf-8' }
    });

    await expect(readAnalyzeResponse(response)).resolves.toMatchObject({
      status: 'analysis_failed',
      error: 'The analysis service is temporarily unavailable. Manual review is required.',
      errorCode: 'infrastructure_error',
      analysis: null,
      pricing: null
    });
  });

  it('does not fabricate a price when a request fails before JSON can be read', async () => {
    expect(failedResult('Manual review is required.', 'network_error')).toMatchObject({
      status: 'analysis_failed',
      analysis: null,
      pricing: null
    });
  });
});
