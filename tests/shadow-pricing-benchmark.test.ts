import { describe, expect, it } from 'vitest';
import {
  SHADOW_PRICING_FEATURE_ALLOWLIST,
  SHADOW_PRICING_LEAKAGE_EXCLUSIONS,
  buildShadowPricingRecords,
  classifyShadowPricingTier,
  createTimeAwareFolds,
  runShadowPricingBenchmark,
  aggregatePredictions,
  buildNumericStats,
  fitTierPredictor,
  intervalCoverage,
  parseDate,
  type ShadowPricingRawRecord
} from '../app/lib/shadow-pricing-benchmark';

function row(overrides: Partial<ShadowPricingRawRecord> = {}): ShadowPricingRawRecord {
  return {
    estimate_date: '2026-01-01',
    final_completed_price: '$500',
    service_type: 'Mixed junk',
    city: 'Synthetic region',
    distance_tier: 'Within 25 miles',
    estimated_load_count: '1',
    planned_workers: '1',
    stairs: 'No',
    carry_distance: 'Short carry',
    heavy_items: 'No',
    demo_required: 'No',
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
    const low = buildShadowPricingRecords([row({ final_completed_price: '$200' })]).records[0];
    const high = buildShadowPricingRecords([row({ final_completed_price: '$2,000' })]).records[0];

    expect(classifyShadowPricingTier(low.features)).toBe(classifyShadowPricingTier(high.features));
  });

  it('creates blocked expanding folds with training rows before test rows', () => {
    const rows = Array.from({ length: 20 }, (_, index) =>
      row({
        estimate_date: `2026-01-${String(index + 1).padStart(2, '0')}`,
        final_completed_price: String(300 + index * 20)
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
    const rows = Array.from({ length: 90 }, (_, index) =>
      row({
        estimate_date: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10)
      })
    );

    const result = runShadowPricingBenchmark(rows, 'test-commit');

    expect(result.status).toBe('ok');
    expect(result.evaluation?.metrics.map((metric) => metric.model)).toEqual([
      'deterministic_job_tier_median',
      'comparable_job_retrieval',
      'huber_regression'
    ]);
    expect(result.privacy).toEqual({
      rawRowsReturned: false,
      rowLevelPredictionsReturned: false,
      reversibleRowHashesReturned: false,
      secretValuesReturned: false
    });
    expect(JSON.stringify(result)).not.toContain('private note');
    expect(JSON.stringify(result)).not.toContain('Synthetic region');
    expect(result.evaluation?.quantile.status).toBe('unavailable');
    expect(new Set(result.evaluation?.metrics.map((metric) => metric.evaluatedRows)).size).toBe(1);
    expect(result.evaluation?.perTier.reduce((sum, tier) => sum + tier.matchedRows, 0)).toBe(result.evaluation?.matchedRows);
  });

  it('prefers canonical values and never fills blanks from ambiguous legacy fields', () => {
    const canonical = buildShadowPricingRecords([row({ Date: '1990-01-01', Amount: '999999', Workers: '9' })]).records[0];
    expect(canonical.estimateDate.getUTCFullYear()).toBe(2026);
    expect(canonical.targetFinalCompletedPrice).toBe(500);
    expect(canonical.features.plannedWorkers).toBe(1);
    const blocked = buildShadowPricingRecords([row({ estimate_date: '', final_completed_price: '', Date: '2026-01-01', Amount: '500' })]);
    expect(blocked.records).toHaveLength(0);
    expect(Object.values(blocked.fieldBlockers)).toEqual([1, 1]);
    const legacyOnly = runShadowPricingBenchmark([{ Date: '2026-01-01', Amount: '500', Workers: '1' }]);
    expect(legacyOnly.status).toBe('blocked');
    expect(legacyOnly.dataset?.excludedRows).toBe(1);
    expect(legacyOnly.evaluation?.metrics.every((metric) => metric.mae === null)).toBe(true);
  });

  it('uses only documented lowercase workers alias when planned_workers is absent', () => {
    const source = row({ workers: '2' });
    delete source.planned_workers;
    expect(buildShadowPricingRecords([source]).records[0].features.plannedWorkers).toBe(2);
    expect(buildShadowPricingRecords([row({ planned_workers: '', workers: '2', Workers: '9' })]).records[0].features.plannedWorkers).toBeNull();
  });

  it('excludes actual loads, labor, outcomes, prices and identifiers from predictors', () => {
    const a = buildShadowPricingRecords([row()]).records[0];
    const b = buildShadowPricingRecords([row({ actual_load_count: '100', actual_labor_hours: '200', direct_job_cost: '9000', won_job: 'false', completed_date: '2099-01-01', final_completed_price: '90000', notes: 'synthetic private marker', customer_name: 'synthetic identity' })]).records[0];
    expect(b.features).toEqual(a.features);
    expect(b.tier).toEqual(a.tier);
  });

  it('groups identical dates at every boundary and rejects invalid dates', () => {
    const records = buildShadowPricingRecords(Array.from({ length: 40 }, (_, i) => row({ estimate_date: `2026-01-${String(Math.floor(i / 4) + 1).padStart(2, '0')}` }))).records;
    const folds = createTimeAwareFolds(records);
    expect(folds.length).toBeGreaterThan(1);
    const evaluated = new Set<number>();
    for (const fold of folds) {
      expect(fold.train.at(-1)!.estimateDate.getTime()).toBeLessThan(fold.test[0].estimateDate.getTime());
      for (const record of fold.test) {
        expect(evaluated.has(record.rowNumber)).toBe(false);
        evaluated.add(record.rowNumber);
      }
    }
    expect(createTimeAwareFolds(Array.from({ length: 30 }, () => records[0]))).toHaveLength(0);
    expect(parseDate('2026-02-30')).toBeNull();
  });

  it('preserves missing numbers, fits medians on training data and abstains on unknown tiers', () => {
    const records = buildShadowPricingRecords([row({ planned_workers: '', estimated_load_count: '' }), row({ planned_workers: '2' }), row({ planned_workers: '4' })]).records;
    expect(records[0].features.estimatedLoadCount).toBeNull();
    expect(records[0].tier).toBe('unknown_inputs');
    const stats = buildNumericStats(records);
    expect(stats.get('plannedWorkers')?.median).toBe(3);
    const test = buildShadowPricingRecords([row({ planned_workers: '9000' })]).records[0];
    expect(test.features.plannedWorkers).toBe(9000);
    expect(stats.get('plannedWorkers')?.median).toBe(3);
    expect(fitTierPredictor('comparable_job_retrieval', records, 'unknown_inputs')(records[0]).predicted).toBeNull();
  });

  it('isolates small/mid retrieval and fitted predictions from project price spikes', () => {
    for (const load of ['0.5', '1']) {
      const train = buildShadowPricingRecords(Array.from({ length: 40 }, (_, i) => row({ estimated_load_count: load, estimate_date: new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10) }))).records;
      const test = buildShadowPricingRecords([row({ estimated_load_count: load, estimate_date: '2026-04-01' })]).records[0];
      const spikes = buildShadowPricingRecords([row({ estimated_load_count: '10', final_completed_price: '9999999' }), row({ estimated_load_count: '10', demo_required: 'yes', final_completed_price: '8888888' })]).records;
      for (const model of ['comparable_job_retrieval', 'huber_regression', 'deterministic_job_tier_median'] as const) {
        const expected = fitTierPredictor(model, train, test.tier)(test);
        expect(expected.predicted).toBeCloseTo(500);
        expect(fitTierPredictor(model, [...train, ...spikes], test.tier)(test)).toEqual(expected);
        expect(fitTierPredictor(model, train, test.tier)(train[0]).reason).toBe('invalid_holdout');
        expect(fitTierPredictor(model, train.slice(0, 2), test.tier)(test).predicted).toBeNull();
      }
      expect(fitTierPredictor('comparable_job_retrieval', spikes, 'large_project')(spikes[0]).reason).toBe('component_pricing_manager_review');
    }
  });

  it('reports abstentions and compares only the intersection of all methods', () => {
    const result = runShadowPricingBenchmark(Array.from({ length: 90 }, (_, i) => row({
      estimate_date: new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10),
      estimated_load_count: i % 7 === 0 ? '10' : '1'
    })));
    const evaluation = result.evaluation!;
    expect(evaluation.matchedRows).toBeGreaterThan(0);
    for (const metric of evaluation.metrics) expect(metric.evaluatedRows).toBe(evaluation.matchedRows);
    for (const method of evaluation.availability) expect(method.predictedRows + Object.values(method.abstentions).reduce((a, b) => a + b, 0)).toBe(evaluation.holdoutRows);
    expect(evaluation.perTier.find((tier) => tier.tier === 'large_project')?.matchedRows).toBe(0);
    expect(evaluation.diagnosticGlobalMedian.evaluatedRows).toBe(evaluation.holdoutRows);
    expect(evaluation.bestBaseline).toBeNull();
  });

  it('computes historical-price errors without claiming economic underpricing', () => {
    const metric = aggregatePredictions('comparable_job_retrieval', [
      { actual: 100, predicted: 80, tier: 'small_routine' },
      { actual: 200, predicted: 230, tier: 'small_routine' }
    ]);
    expect(metric.mae).toBe(25);
    expect(metric.rmse).toBe(25.5);
    expect(metric.belowHistoricalPriceFrequency).toBe(0.5);
    expect(metric.totalShortfallVsHistoricalPrice).toBe(20);
    expect(aggregatePredictions('comparable_job_retrieval', []).mae).toBeNull();
  });

  it('validates nominal 60% coverage, inclusivity, crossing and unavailable quantile solver', () => {
    const intervals = Array.from({ length: 10 }, (_, i) => ({ actual: i + 0.5, lower: 2, upper: 8 }));
    expect(intervalCoverage(intervals)).toEqual({ nominalCoverage: 0.6, validIntervals: 10, invalidIntervals: 0, coverage: 0.6 });
    expect(intervalCoverage([{ actual: 2, lower: 2, upper: 8 }, { actual: 8, lower: 2, upper: 8 }]).coverage).toBe(1);
    expect(intervalCoverage([{ actual: 5, lower: 8, upper: 2 }, { actual: 5, lower: NaN, upper: 8 }])).toEqual({ nominalCoverage: 0.6, validIntervals: 0, invalidIntervals: 2, coverage: null });
    const record = buildShadowPricingRecords([row()]).records[0];
    expect(fitTierPredictor('regularized_quantile_regression', [record], record.tier)(record).reason).toBe('quantile_solver_unavailable');
  });
});
