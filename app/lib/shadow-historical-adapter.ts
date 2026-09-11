// Tristan's 2026-09-10 confirmations apply to historical meaning, not quote-time availability.
export const HISTORICAL_MAPPINGS = {
  completion_date: ['completion_date', 'Date'],
  final_completed_price: ['final_completed_price', 'Amount'],
  profit: ['profit', 'Net Profit'],
  projected_loads: ['projected_loads', 'estimated_load_count', 'Estimated Loads', 'Estimated_Loads', 'Projected Loads'],
  actual_loads: ['actual_loads', 'actual_load_count', 'Actual Loads'],
  actual_workers: ['actual_workers', 'Workers', 'workers'],
  stairs: ['stairs', 'Stairs'],
  carry_distance_ordinal: ['carry_distance_ordinal', 'Carry distance', 'Carry Distance', 'Carry_Distance', 'carry_distance'],
  heavy_items: ['heavy_items', 'Heavy Items', 'Heavy_Items'],
  demo_required: ['demo_required', 'Demolition']
} as const;

type Field = keyof typeof HISTORICAL_MAPPINGS;
type Status = 'absent_header' | 'blank' | 'invalid' | 'conflict' | 'valid';
type Value = string | number | boolean | null;
export type QuoteTimeProvenance = 'unknown' | 'verified_pre_quote';
export type HistoricalDiagnostics = ReturnType<typeof historicalDiagnostics>;

function numeric(text: string): number | null {
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

function money(text: string) {
  const negative = /^\(.*\)$/.test(text);
  const value = numeric(text.replace(/[,$()\s]/g, ''));
  return value === null ? null : negative ? -Math.abs(value) : value;
}

function date(text: string) {
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const us = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!iso && !us) return null;
  const [y, m, d] = iso ? [Number(iso[1]), Number(iso[2]), Number(iso[3])] : [Number(us![3]), Number(us![1]), Number(us![2])];
  const parsed = new Date(Date.UTC(y, m - 1, d));
  return parsed.getUTCFullYear() === y && parsed.getUTCMonth() === m - 1 && parsed.getUTCDate() === d ? parsed.toISOString().slice(0, 10) : null;
}

function parse(field: Field, text: string): Value {
  if (field === 'completion_date') return date(text);
  if (field === 'final_completed_price' || field === 'profit') return money(text);
  if (['stairs', 'heavy_items', 'demo_required'].includes(field)) {
    const value = text.toLowerCase();
    if (['1', 'true', 'yes', 'y'].includes(value)) return true;
    if (['0', 'false', 'no', 'n'].includes(value)) return false;
    return null;
  }
  const value = numeric(text);
  if (value === null) return null;
  if (field === 'actual_workers') return Number.isInteger(value) && value >= 0 ? value : null;
  if (field === 'projected_loads' || field === 'actual_loads') return value >= 0 ? value : null;
  // Ordinal order only: no assumed units, endpoints, equal spacing, or tier thresholds.
  return value;
}

export function adaptHistoricalRecord(row: Record<string, string>) {
  const fields = {} as Record<Field, { status: Status; value: Value }>;
  let dateAliases = { absent: false, blankAliases: 0, invalidAliases: 0, populatedValidAliases: 0, equivalentNormalizedDates: false, conflictingPopulatedDates: false, resolvedWithBlankAlias: false };
  for (const field of Object.keys(HISTORICAL_MAPPINGS) as Field[]) {
    const normalize = (name: string) => name.trim().toLowerCase().replace(/[_\s]+/g, ' ');
    const aliases = new Set(HISTORICAL_MAPPINGS[field].map(normalize));
    const headers = Object.keys(row).filter((name) => aliases.has(normalize(name)));
    const parsed = headers.map((header) => {
      const text = row[header].trim();
      const value = text ? parse(field, text) : null;
      return { value, status: (!text ? 'blank' : value === null ? 'invalid' : 'valid') as Status };
    });
    const first = parsed[0];
    if (field === 'completion_date') {
      const valid = parsed.filter((cell) => cell.status === 'valid');
      const unique = new Set(valid.map((cell) => cell.value));
      const invalid = parsed.filter((cell) => cell.status === 'invalid').length;
      const blanks = parsed.filter((cell) => cell.status === 'blank').length;
      dateAliases = { absent: !parsed.length, blankAliases: blanks, invalidAliases: invalid,
        populatedValidAliases: valid.length, equivalentNormalizedDates: valid.length > 1 && unique.size === 1,
        conflictingPopulatedDates: unique.size > 1, resolvedWithBlankAlias: blanks > 0 && unique.size === 1 && invalid === 0 };
      // Confirmed completion-date aliases: blank is no competing date, not a contradiction.
      fields[field] = unique.size > 1 ? { status: 'conflict', value: null }
        : invalid ? { status: 'invalid', value: null }
        : valid[0] ?? { status: parsed.length ? 'blank' : 'absent_header', value: null };
      continue;
    }
    // A populated alias cannot silently override a blank or conflicting canonical column.
    const conflict = parsed.length > 1 && (parsed.some((item) => item.status === 'invalid') || parsed.some((item) => item.status !== first.status || item.value !== first.value));
    fields[field] = conflict ? { value: null, status: 'conflict' } : first ?? { value: null, status: 'absent_header' };
  }
  return {
    fields,
    dateAliases,
    // This means all mapped formats are valid, not that their business semantics are complete.
    formatValid: Object.values(fields).every((field) => field.status === 'valid'),
    quoteTimeProvenance: 'unknown' as const
  };
}

function distribution(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const round = (n: number) => Math.round(n * 100) / 100;
  const quantile = (p: number) => {
    if (!sorted.length) return null;
    const index = (sorted.length - 1) * p;
    const low = Math.floor(index);
    return round(sorted[low] + (sorted[Math.ceil(index)] - sorted[low]) * (index - low));
  };
  return { count: sorted.length, min: quantile(0), p25: quantile(0.25), median: quantile(0.5), p75: quantile(0.75), max: quantile(1), mean: sorted.length ? round(sorted.reduce((a, b) => a + b, 0) / sorted.length) : null };
}

export const PRICE_SEGMENTS = ['Small', 'Medium', 'Large', 'Major project'] as const;
export function retrospectivePriceSegment(price: number | null | undefined) {
  if (typeof price !== 'number' || !Number.isFinite(price)) return null;
  return price <= 450 ? 'Small' : price <= 1000 ? 'Medium' : price <= 2500 ? 'Large' : 'Major project';
}

function retrospectiveSegments(rows: ReturnType<typeof adaptHistoricalRecord>[]) {
  const priced = rows.filter((row) => row.fields.final_completed_price.status === 'valid');
  const totalRevenue = priced.reduce((sum, row) => sum + Number(row.fields.final_completed_price.value), 0);
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    classification: 'RETROSPECTIVE_FINAL_PRICE_ONLY', pricedJobs: priced.length,
    unclassifiedJobs: rows.length - priced.length,
    percentileMethod: 'Linear interpolation at (n - 1) * p on ascending valid values; round summaries to two decimals.',
    segments: PRICE_SEGMENTS.map((name) => {
      const group = priced.filter((row) => retrospectivePriceSegment(Number(row.fields.final_completed_price.value)) === name);
      const values = group.map((row) => Number(row.fields.final_completed_price.value));
      const revenue = values.reduce((a, b) => a + b, 0);
      const pairs = group.filter((row) => row.fields.projected_loads.status === 'valid' && row.fields.actual_loads.status === 'valid');
      const differences = pairs.map((row) => Number(row.fields.projected_loads.value) - Number(row.fields.actual_loads.value));
      const summaries = (['stairs', 'heavy_items', 'demo_required', 'carry_distance_ordinal', 'actual_workers'] as Field[]).map((field) => {
        const counts: Record<Status, number> = { valid: 0, absent_header: 0, blank: 0, invalid: 0, conflict: 0 };
        const levels: Record<string, number> = {};
        for (const row of group) {
          const cell = row.fields[field];
          counts[cell.status] += 1;
          if (cell.status === 'valid') levels[String(cell.value)] = (levels[String(cell.value)] ?? 0) + 1;
        }
        return { field, denominator: group.length, validDenominator: counts.valid, counts, levels };
      });
      const suppressed = group.length > 0 && group.length < 5;
      return {
        name, jobs: group.length, pricedJobPercentage: priced.length ? round(100 * group.length / priced.length) : null,
        revenue: suppressed ? null : round(revenue), revenuePercentage: suppressed || totalRevenue === 0 ? null : round(100 * revenue / totalRevenue),
        finalPrice: suppressed ? null : distribution(values), smallSample: group.length < 10, priceSummarySuppressed: suppressed,
        loadDiscrepancy: { pairedRecords: pairs.length, unavailableRecords: group.length - pairs.length,
          estimatedMinusActual: pairs.length >= 5 ? distribution(differences) : null,
          meanAbsoluteDifference: pairs.length >= 5 ? distribution(differences.map(Math.abs)).mean : null,
          summarySuppressed: pairs.length > 0 && pairs.length < 5, unitComparability: 'UNVERIFIED' },
        characteristics: summaries
      };
    })
  };
}

export function historicalDiagnostics(rows: Record<string, string>[]) {
  const fields = Object.fromEntries(Object.keys(HISTORICAL_MAPPINGS).map((field) => [field, { absent_header: 0, blank: 0, invalid: 0, conflict: 0, valid: 0 }])) as Record<Field, Record<Status, number>>;
  let formatValidHistoricalRows = 0;
  const adaptedRows = rows.map(adaptHistoricalRecord);
  for (const adapted of adaptedRows) {
    if (adapted.formatValid) formatValidHistoricalRows += 1;
    for (const field of Object.keys(fields) as Field[]) fields[field][adapted.fields[field].status] += 1;
  }
  const numericValues = (field: Field) => adaptedRows.flatMap((row) => row.fields[field].status === 'valid' && typeof row.fields[field].value === 'number' ? [row.fields[field].value as number] : []);
  const completionDates = adaptedRows.flatMap((row) => row.fields.completion_date.status === 'valid' ? [row.fields.completion_date.value as string] : []).sort();
  const coreValid = adaptedRows.filter((row) => row.fields.completion_date.status === 'valid' && row.fields.final_completed_price.status === 'valid').length;
  const paired = adaptedRows.filter((row) => row.fields.projected_loads.status === 'valid' && row.fields.actual_loads.status === 'valid');
  const differences = paired.map((row) => Number(row.fields.projected_loads.value) - Number(row.fields.actual_loads.value));
  const buckets = (field: Field) => {
    const groups = new Map<string, typeof adaptedRows>();
    for (const row of adaptedRows) {
      const cell = row.fields[field];
      const key = cell.status === 'valid' ? String(cell.value) : cell.status;
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    return Array.from(groups, ([recordedValue, group]) => {
      const prices = group.flatMap((row) => row.fields.final_completed_price.status === 'valid' ? [Number(row.fields.final_completed_price.value)] : []);
      return { recordedValue, records: group.length, pricedRecords: prices.length, finalPrice: prices.length >= 5 ? distribution(prices) : null, priceSummarySuppressed: prices.length < 5 };
    });
  };
  // Candidate duplicates use only confirmed mapped fields, never identities, notes or photos.
  const signatures = new Map<string, number>();
  for (const row of adaptedRows) {
    if (row.fields.completion_date.status !== 'valid' || row.fields.final_completed_price.status !== 'valid') continue;
    const signature = JSON.stringify(Object.values(row.fields).map((cell) => [cell.status, cell.value]));
    signatures.set(signature, (signatures.get(signature) ?? 0) + 1);
  }
  const duplicateSizes = [...signatures.values()].filter((n) => n > 1);
  const completionDateAliasDiagnostics = {
    absentHeaderRows: adaptedRows.filter((row) => row.dateAliases.absent).length,
    allBlankRows: fields.completion_date.blank,
    rowsWithBlankAliases: adaptedRows.filter((row) => row.dateAliases.blankAliases > 0).length,
    rowsWithInvalidAliases: adaptedRows.filter((row) => row.dateAliases.invalidAliases > 0).length,
    equivalentNormalizedDateRows: adaptedRows.filter((row) => row.dateAliases.equivalentNormalizedDates).length,
    conflictingPopulatedDateRows: adaptedRows.filter((row) => row.dateAliases.conflictingPopulatedDates).length,
    resolvedWithBlankAliasRows: adaptedRows.filter((row) => row.dateAliases.resolvedWithBlankAlias).length
  };
  // Never return mapped values or row-level diagnostics from the aggregate interface.
  return {
    returnedRows: rows.length, formatValidHistoricalRows,
    validHistoricalCoreRows: coreValid,
    descriptiveUsableRows: adaptedRows.filter((row) => Object.values(row.fields).some((cell) => cell.status === 'valid')).length,
    verifiedPreQuoteRows: 0, genuineQuoteEvaluationRows: 0,
    unknownQuoteTimeProvenanceRows: rows.length, fields,
    completionDateAliasDiagnostics,
    completionDateCoverage: { records: completionDates.length, earliest: completionDates[0] ?? null, latest: completionDates.at(-1) ?? null },
    duplicateCandidates: { assessedRecords: coreValid, status: coreValid ? 'ASSESSED_MAPPED_FIELDS_ONLY' : 'NOT_ASSESSABLE', groups: duplicateSizes.length, records: duplicateSizes.reduce((a, b) => a + b, 0), excessRecords: duplicateSizes.reduce((a, b) => a + b - 1, 0), removed: 0 },
    finalPrice: distribution(numericValues('final_completed_price')),
    retrospectivePriceSegments: retrospectiveSegments(adaptedRows),
    recordedLoadDifference: { pairedRecords: paired.length, estimatedMinusActual: distribution(differences), meanAbsoluteDifference: distribution(differences.map(Math.abs)).mean, unitComparability: 'UNVERIFIED', interpretation: 'Recorded-number differences only; not capacity-normalized load error or pre-quote accuracy.' },
    characteristics: { stairs: buckets('stairs'), carryOrdinal: buckets('carry_distance_ordinal'), heavyMaterials: buckets('heavy_items'), demolition: buckets('demo_required') },
    serviceType: { status: 'UNVERIFIED_SOURCE', usableRecords: 0, reason: 'No source service-type field/category provenance confirmed for this retrieval; no arbitrary categories published.' },
    benchmarkStatus: 'BENCHMARK_BLOCKED_PROVENANCE', decision: 'NO_MODEL_READY'
  };
}
