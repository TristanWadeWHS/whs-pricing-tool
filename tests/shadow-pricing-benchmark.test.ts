import { describe, expect, it } from 'vitest';
import {
  SHADOW_PRICING_FEATURE_ALLOWLIST,
  SHADOW_PRICING_LEAKAGE_EXCLUSIONS,
  buildShadowPricingRecords,
  classifyShadowPricingTier,
  createTimeAwareFolds,
  runShadowPricingBenchmark,
  type ShadowPricingRawRecord
} from '../app/lib/shadow-pricing-benchmark';

function row(overrides: Partial<ShadowPricingRawRecord> = {}): ShadowPricingRawRecord {
  return {
    Date: '2026-01-01',
    Amount: '$500',
    'Job Type': 'Mixed junk',
    City: 'Mission Viejo',
    Distance: 'Within 25 miles',
    Estimated_Loads: '1',
    Workers: '1',
    Stairs: 'No',
    Carry_Distance: 'Short carry',
    Heavy_Items: 'No',
    Demo_Required: 'No',
    Actual_Loads: '9',
    Notes: 'private note must never become a feature',
    Won_Job: 'Yes',
    ...overrides
  };
}

describe('shadow pricing benchmark', () => {
  it('builds records only from approved estimate-time features', () => {
    const { records } = buildShadowPricingRecords([row()]);

    expect(records).toHaveLength(1);
    expect(Object.keys(records[0].features).sort()).toEqual([
      'carryDistance',
      'cityRegion',
      'demoRequired',
      'distanceTier',
      'estimateMonth',
      'estimateYear',
      'estimatedLoadCount',
      'heavyItems',
      'plannedWorkers',
      'serviceType',
      'stairs'
    ].sort());
    expect(SHADOW_PRICING_FEATURE_ALLOWLIST).not.toContain('actual_load_count');
    expect(SHADOW_PRICING_LEAKAGE_EXCLUSIONS).toContain('notes_free_text');
  });

  it('keeps tier classification independent of final price', () => {
    const low = buildShadowPricingRecords([row({ Amount: '$200' })]).records[0];
    const high = buildShadowPricingRecords([row({ Amount: '$2,000' })]).records[0];

    expect(classifyShadowPricingTier(low.features)).toBe(classifyShadowPricingTier(high.features));
  });

  it('creates blocked expanding folds with training rows before test rows', () => {
    const rows = Array.from({ length: 20 }, (_, index) =>
      row({
        Date: `2026-01-${String(index + 1).padStart(2, '0')}`,
        Amount: String(300 + index * 20)
      })
    );
    const { records } = buildShadowPricingRecords(rows);
    const folds = createTimeAwareFolds(records);

    expect(folds.length).toBeGreaterThan(1);
    for (const fold of folds) {
      const lastTrain = Math.max(...fold.train.map((record) => record.estimateDate.getTime()));
      const firstTest = Math.min(...fold.test.map((record) => record.estimateDate.getTime()));
      expect(lastTrain).toBeLessThan(firstTest);
    }
  });

  it('returns aggregate metrics without row-level predictions or raw rows', () => {
    const rows = Array.from({ length: 36 }, (_, index) =>
      row({
        Date: `2026-${String(Math.floor(index / 3) + 1).padStart(2, '0')}-01`,
        Amount: String(250 + index * 15),
        Estimated_Loads: String((index % 3) + 0.5),
        Workers: String((index % 2) + 1)
      })
    );

    const result = runShadowPricingBenchmark(rows, 'test-commit');

    expect(result.status).toBe('ok');
    expect(result.evaluation?.metrics.map((metric) => metric.model)).toEqual([
      'global_historical_median',
      'deterministic_job_tier_median',
      'comparable_job_retrieval',
      'huber_regression',
      'regularized_quantile_regression'
    ]);
    expect(result.privacy).toEqual({
      rawRowsReturned: false,
      rowLevelPredictionsReturned: false,
      reversibleRowHashesReturned: false,
      secretValuesReturned: false
    });
    expect(JSON.stringify(result)).not.toContain('private note');
  });
});
