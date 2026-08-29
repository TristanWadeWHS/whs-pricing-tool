import { afterEach, describe, expect, it, vi } from 'vitest';
import { sampleAnalysis } from './helpers';

const parseMock = vi.hoisted(() => vi.fn());

vi.mock('openai', () => ({
  default: vi.fn(function OpenAIMock() {
    return {
      responses: {
        parse: parseMock
      }
    };
  })
}));

import { POST } from '../app/api/analyze/route';

const originalApiKey = process.env.OPENAI_API_KEY;
const originalModel = process.env.OPENAI_MODEL;

afterEach(() => {
  parseMock.mockReset();
  process.env.OPENAI_API_KEY = originalApiKey;
  process.env.OPENAI_MODEL = originalModel;
});

describe('/api/analyze route', () => {
  it('returns priced output for a valid mocked OpenAI structured response', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_MODEL = 'test-model';
    parseMock.mockResolvedValue({ output_parsed: sampleAnalysis({ confidencePercent: 92 }) });

    const response = await POST(makeAnalyzeRequest([jpegFile('small.jpg', 512 * 1024)]) as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('direct_quote_eligible');
    expect(body.analysis.confidencePercent).toBe(92);
    expect(body.pricing.suggestedQuote).toBeGreaterThan(0);
    expect(body.pricing.customerMessage).toContain('$');
  });

  it('fails safely without a fabricated price when OpenAI rejects the request', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_MODEL = 'test-model';
    parseMock.mockRejectedValue(new Error('provider failed'));

    const response = await POST(makeAnalyzeRequest([jpegFile('small.jpg', 512 * 1024)]) as any);
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.status).toBe('analysis_failed');
    expect(body.analysis).toBeNull();
    expect(body.pricing).toBeNull();
  });
});

function makeAnalyzeRequest(files: File[]) {
  const form = new FormData();
  for (const file of files) {
    form.append('photos', file);
  }
  form.set('distanceTier', 'under25');
  form.set('jobType', 'mixed junk');
  form.set('carryDistance', 'short');
  form.set('stairs', 'none');
  form.set('workers', '1');
  form.set('notes', 'synthetic route test');

  return new Request('https://example.test/api/analyze', {
    method: 'POST',
    body: form
  });
}

function jpegFile(name: string, size: number) {
  const bytes = new Uint8Array(size);
  bytes[0] = 0xff;
  bytes[1] = 0xd8;
  bytes[2] = 0xff;
  bytes[3] = 0xdb;
  return new File([bytes], name, { type: 'image/jpeg' });
}
