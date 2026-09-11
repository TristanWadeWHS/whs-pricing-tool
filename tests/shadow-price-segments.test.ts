import { describe, expect, it } from 'vitest';
import { adaptHistoricalRecord, historicalDiagnostics, retrospectivePriceSegment } from '../app/lib/shadow-historical-adapter';

describe('retrospective final-price segments', () => {
  it('uses mutually exclusive exact boundaries, never commercial classification', () => {
    for (const [price, expected] of [[0, 'Small'], [450, 'Small'], [450.01, 'Medium'], [1000, 'Medium'], [1000.01, 'Large'], [2500, 'Large'], [2500.01, 'Major project']] as const) {
      expect(retrospectivePriceSegment(price)).toBe(expected);
    }
    for (const price of [null, undefined, NaN, Infinity]) expect(retrospectivePriceSegment(price)).toBeNull();
  });

  it('computes counts, revenue shares, interpolated percentiles and recorded load differences', () => {
    const prices = [100, 200, 300, 400, 450, ...Array(5).fill(500), ...Array(5).fill(2000), ...Array(5).fill(3000)];
    const result = historicalDiagnostics(prices.map((Amount) => ({ Amount: String(Amount), 'Estimated Loads': '1', 'Actual Loads': '2', Stairs: '1', 'Carry Distance': '3' })));
    const segments = result.retrospectivePriceSegments.segments;
    const small = segments[0];
    expect(small).toMatchObject({ jobs: 5, pricedJobPercentage: 25, revenue: 1450, revenuePercentage: 5.01, smallSample: true, priceSummarySuppressed: false });
    expect(small.finalPrice).toEqual({ count: 5, min: 100, p25: 200, median: 300, p75: 400, max: 450, mean: 290 });
    expect(small.loadDiscrepancy).toMatchObject({ pairedRecords: 5, unavailableRecords: 0, meanAbsoluteDifference: 1, unitComparability: 'UNVERIFIED' });
    expect(small.loadDiscrepancy.estimatedMinusActual?.mean).toBe(-1);
    expect(segments.reduce((n, s) => n + s.jobs, 0)).toBe(20);
    expect(segments.reduce((n, s) => n + (s.revenue ?? 0), 0)).toBe(28950);
    expect(small.characteristics.find((c) => c.field === 'stairs')).toMatchObject({ denominator: 5, validDenominator: 5, levels: { true: 5 } });
    expect(result.benchmarkStatus).toBe('BENCHMARK_BLOCKED_PROVENANCE');
    expect(result.verifiedPreQuoteRows).toBe(0);
  });

  it('leaves invalid, blank and conflicting prices unclassified and preserves missing denominators', () => {
    const result = historicalDiagnostics([{ Amount: '' }, {}, { Amount: 'unknown' }, { Amount: '100', final_completed_price: '200' }, { Amount: '100' }]);
    expect(result.retrospectivePriceSegments).toMatchObject({ pricedJobs: 1, unclassifiedJobs: 4 });
    const small = result.retrospectivePriceSegments.segments[0];
    expect(small.finalPrice).toBeNull();
    expect(small.revenue).toBeNull();
    expect(small.priceSummarySuppressed).toBe(true);
    expect(small.loadDiscrepancy).toMatchObject({ pairedRecords: 0, unavailableRecords: 1, meanAbsoluteDifference: null });
    expect(small.characteristics[0]).toMatchObject({ denominator: 1, validDenominator: 0, counts: { absent_header: 1 }, levels: {} });
    expect(result.retrospectivePriceSegments.segments[1].finalPrice?.median).toBeNull();
  });
});

describe('completion-date alias diagnosis', () => {
  it('distinguishes no header, all blank, invalid, equivalent and conflicting populated dates', () => {
    const rows = [ {}, { Date: '' }, { Date: 'bad' },
      { Date: '1/15/2026', completion_date: '2026-01-15' },
      { Date: '1/15/2026', completion_date: '2026-01-16' },
      { Date: '1/15/2026', completion_date: '' }
    ];
    const result = historicalDiagnostics(rows);
    expect(result.completionDateAliasDiagnostics).toEqual({ absentHeaderRows: 1, allBlankRows: 1, rowsWithBlankAliases: 2, rowsWithInvalidAliases: 1, equivalentNormalizedDateRows: 1, conflictingPopulatedDateRows: 1, resolvedWithBlankAliasRows: 1 });
    expect(result.fields.completion_date).toEqual({ absent_header: 1, blank: 1, invalid: 1, valid: 2, conflict: 1 });
    expect(result.completionDateCoverage).toEqual({ records: 2, earliest: '2026-01-15', latest: '2026-01-15' });
  });

  it('never chooses between conflicting populated dates or ignores invalid populated aliases', () => {
    expect(adaptHistoricalRecord({ Date: '2026-01-15', completion_date: '2026-01-16' }).fields.completion_date).toEqual({ value: null, status: 'conflict' });
    expect(adaptHistoricalRecord({ Date: '2026-01-15', completion_date: '2026-02-30' }).fields.completion_date).toEqual({ value: null, status: 'invalid' });
    expect(adaptHistoricalRecord({ Date: '2026-01-15', completion_date: '' }).quoteTimeProvenance).toBe('unknown');
  });
});
