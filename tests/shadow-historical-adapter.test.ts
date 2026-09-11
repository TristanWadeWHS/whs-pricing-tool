import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { adaptHistoricalRecord, historicalDiagnostics } from '../app/lib/shadow-historical-adapter';
import { buildShadowPricingRecords, runShadowPricingBenchmark, rowsFromSheetValues } from '../app/lib/shadow-pricing-benchmark';

const historical = {
  Date: '2026-01-15', Amount: '$250', 'Net Profit': '($20)',
  'Estimated Loads': '0.5', 'Actual Loads': '1', Workers: '2', Stairs: '1',
  'Carry distance': '3', 'Heavy Items': 'false', Demolition: 'No'
};

describe('confirmed historical meanings', () => {
  it('loads the offline module with the CLI native TypeScript loader without running a benchmark', () => {
    const output = execFileSync(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--experimental-strip-types', '-e',
      "const m = require('./app/lib/shadow-pricing-benchmark.ts'); process.stdout.write(typeof m.buildShadowPricingRecords);"
    ], { encoding: 'utf8', timeout: 30000 });
    expect(output).toBe('function');
  }, 35000);
  it('maps completed outcomes separately from projected characteristics', () => {
    const result = adaptHistoricalRecord(historical);
    expect(result.formatValid).toBe(true);
    expect(result.quoteTimeProvenance).toBe('unknown');
    expect(Object.fromEntries(Object.entries(result.fields).map(([key, field]) => [key, field.value]))).toEqual({
      completion_date: '2026-01-15', final_completed_price: 250, profit: -20,
      projected_loads: 0.5, actual_loads: 1, actual_workers: 2, stairs: true,
      carry_distance_ordinal: 3, heavy_items: false, demo_required: false
    });
    expect(result.fields).not.toHaveProperty('estimate_date');
    expect(result.fields).not.toHaveProperty('planned_workers');
    expect(result.fields.final_completed_price.value).toBe(250);
  });

  it('preserves canonical blanks rather than silently falling back', () => {
    const result = adaptHistoricalRecord({ ...historical, completion_date: '', final_completed_price: '', actual_workers: '' });
    expect(result.fields.completion_date).toEqual({ status: 'valid', value: '2026-01-15' });
    expect(result.dateAliases.resolvedWithBlankAlias).toBe(true);
    for (const field of ['final_completed_price', 'actual_workers'] as const) {
      expect(result.fields[field]).toEqual({ status: 'conflict', value: null });
    }
    expect(adaptHistoricalRecord({ ...historical, final_completed_price: '300' }).fields.final_completed_price.status).toBe('conflict');
    expect(adaptHistoricalRecord({ ...historical, final_completed_price: '250.00' }).fields.final_completed_price.value).toBe(250);
  });

  it('validates binary encodings and preserves ordinal values without invented scale', () => {
    for (const value of ['yes', 'TRUE', '1', 'y']) expect(adaptHistoricalRecord({ ...historical, Stairs: value }).fields.stairs.value).toBe(true);
    for (const value of ['no', 'FALSE', '0', 'n']) expect(adaptHistoricalRecord({ ...historical, Stairs: value }).fields.stairs.value).toBe(false);
    for (const value of ['2', 'none', 'sometimes']) expect(adaptHistoricalRecord({ ...historical, Stairs: value }).fields.stairs.status).toBe('invalid');
    expect(adaptHistoricalRecord({ ...historical, Stairs: '' }).fields.stairs.value).toBeNull();
    expect(adaptHistoricalRecord({ ...historical, 'Carry distance': '-2.5' }).fields.carry_distance_ordinal.value).toBe(-2.5);
    expect(adaptHistoricalRecord({ ...historical, 'Carry distance': '30 feet' }).fields.carry_distance_ordinal.status).toBe('invalid');
  });

  it('distinguishes absent headers, blanks, invalid values and unknown provenance in aggregates', () => {
    const result = historicalDiagnostics([historical, {}, { ...historical, Amount: '' }, { ...historical, Amount: 'unknown' }]);
    expect(result.fields.final_completed_price).toEqual({ valid: 1, absent_header: 1, blank: 1, invalid: 1, conflict: 0 });
    expect(result.formatValidHistoricalRows).toBe(1);
    expect(result.unknownQuoteTimeProvenanceRows).toBe(4);
    expect(result.verifiedPreQuoteRows).toBe(0);
    expect(result.descriptiveUsableRows).toBe(3);
  });

  it('keeps historical validity distinct from quote-time and tier eligibility', () => {
    const result = runShadowPricingBenchmark([historical], 'synthetic');
    expect(result.dataset?.historical.formatValidHistoricalRows).toBe(1);
    expect(result.dataset?.eligibleRows).toBe(0);
    expect(result.dataset?.fieldBlockers.unknown_quote_time_provenance).toBe(1);
    expect(result.dataset?.fieldBlockers.missing_or_invalid_tier_inputs).toBe(1);
    expect(result.evaluation?.decision).toBe('NO_MODEL_READY');
    expect(result.evaluation?.matchedRows).toBe(0);
    expect(result.evaluation?.bestBaseline).toBeNull();
  });

  it('does not infer provenance from canonical-looking names or before-job records', () => {
    const row = { ...historical, estimate_date: '2026-01-01', final_completed_price: '250' };
    expect(buildShadowPricingRecords([row]).records).toHaveLength(0);
    const verified = buildShadowPricingRecords([row], 'verified_pre_quote').records[0];
    expect(verified.features.plannedWorkers).toBeNull();
    expect(verified.tier).toBe('unknown_inputs');
    expect(verified.features).not.toHaveProperty('actual_workers');
    expect(verified.features).not.toHaveProperty('revenue');
    expect(verified.features).not.toHaveProperty('profit');
  });

  it('detects conflicting load aliases and rejects lossy duplicate headers', () => {
    expect(adaptHistoricalRecord({ ...historical, 'Projected Loads': '2' }).fields.projected_loads.status).toBe('conflict');
    expect(adaptHistoricalRecord({ ...historical, 'Projected Loads': '0.5' }).fields.projected_loads.value).toBe(0.5);
    expect(() => rowsFromSheetValues([['Amount', 'Amount'], ['1', '2']])).toThrow('Duplicate identical');
    expect(rowsFromSheetValues([['Amount'], ['100'], [''], ['200']])).toHaveLength(2);
  });

  it('retains incomplete descriptive records and computes only recorded-number load differences', () => {
    const result = historicalDiagnostics([historical, { ...historical, 'Estimated Loads': '2', 'Actual Loads': '1', Amount: '350' }, { Amount: '500', 'Actual Loads': '' }]);
    expect(result.validHistoricalCoreRows).toBe(2);
    expect(result.descriptiveUsableRows).toBe(3);
    expect(result.finalPrice).toMatchObject({ count: 3, min: 250, median: 350, max: 500, mean: 366.67 });
    expect(result.recordedLoadDifference).toMatchObject({ pairedRecords: 2, meanAbsoluteDifference: 0.75, unitComparability: 'UNVERIFIED' });
    expect(result.recordedLoadDifference.estimatedMinusActual.mean).toBe(0.25);
    expect(result.genuineQuoteEvaluationRows).toBe(0);
    expect(result.benchmarkStatus).toBe('BENCHMARK_BLOCKED_PROVENANCE');
  });

  it('reports duplicate candidates without removing them and suppresses sparse price summaries', () => {
    const result = historicalDiagnostics([historical, { ...historical, Name: 'PRIVATE_SENTINEL', Notes: 'PRIVATE_SENTINEL', photo: 'PRIVATE_SENTINEL' }]);
    expect(result.duplicateCandidates).toEqual({ assessedRecords: 2, status: 'ASSESSED_MAPPED_FIELDS_ONLY', groups: 1, records: 2, excessRecords: 1, removed: 0 });
    expect(historicalDiagnostics([{ Amount: '500' }]).duplicateCandidates).toMatchObject({ assessedRecords: 0, status: 'NOT_ASSESSABLE' });
    expect(result.characteristics.stairs[0]).toMatchObject({ records: 2, finalPrice: null, priceSummarySuppressed: true });
    expect(JSON.stringify(result)).not.toContain('PRIVATE_SENTINEL');
  });
});
