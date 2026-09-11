import { afterEach, describe, expect, it, vi } from 'vitest';
import OpenAI from 'openai';
import { AnalysisError, analyzeJobPhotosWithOpenAI, getConfiguredOpenAIModel } from '../app/lib/openai-analysis';
import { sampleAnalysis, sampleInputs } from './helpers';

const originalModel = process.env.OPENAI_MODEL;

afterEach(() => {
  vi.unstubAllEnvs();
  process.env.OPENAI_MODEL = originalModel;
});

describe('OpenAI analysis wrapper', () => {
  it('uses the actual SDK serializer/parser with core-only schema even in Preview', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    const sent: any[] = [];
    const client = new OpenAI({ apiKey: 'synthetic-no-network', maxRetries: 0, fetch: async (_url, init) => {
      sent.push(JSON.parse(String(init?.body)));
      return Response.json({ id: 'synthetic', object: 'response', status: 'completed', output: [
        { id: 'synthetic-message', type: 'message', role: 'assistant', status: 'completed', content: [
          { type: 'output_text', text: JSON.stringify(sampleAnalysis()), annotations: [] }
        ] }
      ] });
    } });
    const result = await analyzeJobPhotosWithOpenAI(client, sampleInputs(), []);
    expect(result).toEqual(sampleAnalysis());
    expect(sent).toHaveLength(1);
    expect(sent[0].text.format.schema.properties.shadow).toBeUndefined();
    expect(JSON.stringify(sent[0].input)).not.toContain('INTERNAL SHADOW');
  });
  it('does not weaken core validation in the actual SDK parser', async () => {
    const client = new OpenAI({ apiKey: 'synthetic-no-network', maxRetries: 0, fetch: async () => Response.json({
      id: 'synthetic', status: 'completed', output: [{ type: 'message', role: 'assistant', content: [
        { type: 'output_text', text: JSON.stringify(sampleAnalysis({ confidencePercent: 200 })), annotations: [] }
      ] }]
    }) });
    await expect(analyzeJobPhotosWithOpenAI(client, sampleInputs(), [])).rejects.toThrow();
  });
  it('defaults to the configured GPT-5.6-family model name', () => {
    delete process.env.OPENAI_MODEL;
    expect(getConfiguredOpenAIModel()).toBe('gpt-5.6');
  });

  it('rejects blank model configuration without falling back to an older model', () => {
    process.env.OPENAI_MODEL = ' ';
    expect(() => getConfiguredOpenAIModel()).toThrow(AnalysisError);
  });

  it('returns parsed structured output from the SDK helper path', async () => {
    const parsed = sampleAnalysis();
    const client = { responses: { parse: async () => ({ output_parsed: parsed }) } };
    await expect(analyzeJobPhotosWithOpenAI(client as any, sampleInputs(), [])).resolves.toBe(parsed);
  });

  it('fails safely when structured output is missing or the API rejects', async () => {
    const missing = { responses: { parse: async () => ({ output_parsed: null }) } };
    await expect(analyzeJobPhotosWithOpenAI(missing as any, sampleInputs(), [])).rejects.toThrow(AnalysisError);

    const rejected = { responses: { parse: async () => { throw new Error('provider failed'); } } };
    await expect(analyzeJobPhotosWithOpenAI(rejected as any, sampleInputs(), [])).rejects.toThrow('provider failed');
  });

  it('fails safely on timeout', async () => {
    const never = { responses: { parse: () => new Promise(() => undefined) } };
    await expect(analyzeJobPhotosWithOpenAI(never as any, sampleInputs(), [], { timeoutMs: 1 })).rejects.toThrow(AnalysisError);
  });
});

