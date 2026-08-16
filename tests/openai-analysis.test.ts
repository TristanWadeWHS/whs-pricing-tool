import { afterEach, describe, expect, it } from 'vitest';
import { AnalysisError, analyzeJobPhotosWithOpenAI, getConfiguredOpenAIModel } from '../app/lib/openai-analysis';
import { sampleAnalysis, sampleInputs } from './helpers';

const originalModel = process.env.OPENAI_MODEL;

afterEach(() => {
  process.env.OPENAI_MODEL = originalModel;
});

describe('OpenAI analysis wrapper', () => {
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

