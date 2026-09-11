// Tristan's 2026-09-10 confirmations apply to historical meaning, not quote-time availability.
export const HISTORICAL_MAPPINGS = {
  completion_date: ['completion_date', 'Date'],
  revenue: ['revenue', 'Amount'],
  profit: ['profit', 'Net Profit'],
  projected_loads: ['projected_loads', 'Estimated Loads', 'Estimated_Loads'],
  actual_workers: ['actual_workers', 'Workers', 'workers'],
  stairs: ['stairs', 'Stairs'],
  carry_distance_ordinal: ['carry_distance_ordinal', 'Carry distance', 'Carry Distance', 'Carry_Distance', 'carry_distance'],
  heavy_items: ['heavy_items', 'Heavy Items', 'Heavy_Items'],
  demo_required: ['demo_required', 'Demolition']
} as const;

type Field = keyof typeof HISTORICAL_MAPPINGS;
type Status = 'absent_header' | 'blank' | 'invalid' | 'valid';
type Value = string | number | boolean | null;
export type QuoteTimeProvenance = 'unknown' | 'verified_pre_quote';
export type HistoricalDiagnostics = {
  returnedRows: number;
  formatValidHistoricalRows: number;
  unknownQuoteTimeProvenanceRows: number;
  fields: Record<Field, Record<Status, number>>;
};

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
  if (field === 'revenue' || field === 'profit') return money(text);
  if (['stairs', 'heavy_items', 'demo_required'].includes(field)) {
    const value = text.toLowerCase();
    if (['1', 'true', 'yes', 'y'].includes(value)) return true;
    if (['0', 'false', 'no', 'n'].includes(value)) return false;
    return null;
  }
  const value = numeric(text);
  if (value === null) return null;
  if (field === 'actual_workers') return Number.isInteger(value) && value >= 0 ? value : null;
  if (field === 'projected_loads') return value >= 0 ? value : null;
  // Ordinal order only: no assumed units, endpoints, equal spacing, or tier thresholds.
  return value;
}

export function adaptHistoricalRecord(row: Record<string, string>) {
  const fields = {} as Record<Field, { status: Status; value: Value }>;
  for (const field of Object.keys(HISTORICAL_MAPPINGS) as Field[]) {
    const header = HISTORICAL_MAPPINGS[field].find((name) => Object.hasOwn(row, name));
    const text = header === undefined ? '' : row[header].trim();
    const value = text ? parse(field, text) : null;
    fields[field] = { value, status: header === undefined ? 'absent_header' : !text ? 'blank' : value === null ? 'invalid' : 'valid' };
  }
  return {
    fields,
    // This means all mapped formats are valid, not that their business semantics are complete.
    formatValid: Object.values(fields).every((field) => field.status === 'valid'),
    quoteTimeProvenance: 'unknown' as const
  };
}

export function historicalDiagnostics(rows: Record<string, string>[]): HistoricalDiagnostics {
  const fields = Object.fromEntries(Object.keys(HISTORICAL_MAPPINGS).map((field) => [field, { absent_header: 0, blank: 0, invalid: 0, valid: 0 }])) as HistoricalDiagnostics['fields'];
  let formatValidHistoricalRows = 0;
  for (const row of rows) {
    const adapted = adaptHistoricalRecord(row);
    if (adapted.formatValid) formatValidHistoricalRows += 1;
    for (const field of Object.keys(fields) as Field[]) fields[field][adapted.fields[field].status] += 1;
  }
  // Never return mapped values or row-level diagnostics from the aggregate interface.
  return { returnedRows: rows.length, formatValidHistoricalRows, unknownQuoteTimeProvenanceRows: rows.length, fields };
}
