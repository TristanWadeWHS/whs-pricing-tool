import { describe, expect, it } from 'vitest';
import {
  ACCESS_EXPIRED_ERROR,
  UNEXPECTED_ANALYZE_RESPONSE_ERROR,
  UPLOAD_TOO_LARGE_ERROR,
  parseAnalyzeResponse
} from '../app/lib/analyze-response';

describe('analyze response parsing', () => {
  it('returns JSON analyze results unchanged', async () => {
    const response = Response.json({
      status: 'analysis_failed',
      error: 'Server-provided safe failure',
      analysis: null,
      pricing: null,
      inputs: null
    });

    await expect(parseAnalyzeResponse(response)).resolves.toMatchObject({
      status: 'analysis_failed',
      error: 'Server-provided safe failure'
    });
  });

  it('turns non-JSON unauthorized responses into a safe access message', async () => {
    const response = new Response('Unauthorized', {
      status: 401,
      headers: { 'content-type': 'text/plain' }
    });

    await expect(parseAnalyzeResponse(response)).resolves.toMatchObject({
      status: 'analysis_failed',
      error: ACCESS_EXPIRED_ERROR,
      pricing: null
    });
  });

  it('turns non-JSON oversized-upload responses into a safe upload message', async () => {
    const response = new Response('Payload Too Large', {
      status: 413,
      headers: { 'content-type': 'text/plain' }
    });

    await expect(parseAnalyzeResponse(response)).resolves.toMatchObject({
      status: 'analysis_failed',
      error: UPLOAD_TOO_LARGE_ERROR,
      pricing: null
    });
  });

  it('turns other non-JSON responses into the existing safe failure message', async () => {
    const response = new Response('<html>Error</html>', {
      status: 502,
      headers: { 'content-type': 'text/html' }
    });

    await expect(parseAnalyzeResponse(response)).resolves.toMatchObject({
      status: 'analysis_failed',
      error: UNEXPECTED_ANALYZE_RESPONSE_ERROR,
      pricing: null
    });
  });
});
