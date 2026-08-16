import { describe, expect, it } from 'vitest';
import { parseVisionAnalysis } from '../app/lib/analysis-schema';
import { sampleAnalysis } from './helpers';

describe('vision analysis schema', () => {
  it('accepts a complete structured model response', () => {
    expect(parseVisionAnalysis(sampleAnalysis()).success).toBe(true);
  });

  it('rejects missing required fields', () => {
    const value: any = sampleAnalysis();
    delete value.confidencePercent;
    expect(parseVisionAnalysis(value).success).toBe(false);
  });

  it('rejects wrong data types', () => {
    expect(parseVisionAnalysis({ ...sampleAnalysis(), estimatedLoadPercent: '50' }).success).toBe(false);
  });

  it('rejects invalid enums', () => {
    expect(parseVisionAnalysis({ ...sampleAnalysis(), heavyDebrisRisk: 'extreme' }).success).toBe(false);
  });

  it('rejects out-of-range confidence and load percentage', () => {
    expect(parseVisionAnalysis({ ...sampleAnalysis(), confidencePercent: 101 }).success).toBe(false);
    expect(parseVisionAnalysis({ ...sampleAnalysis(), estimatedLoadPercent: 201 }).success).toBe(false);
  });

  it('rejects malformed, refusal-like, or incomplete output', () => {
    expect(parseVisionAnalysis('refusal').success).toBe(false);
    expect(parseVisionAnalysis({ refusal: 'cannot comply' }).success).toBe(false);
  });
});

