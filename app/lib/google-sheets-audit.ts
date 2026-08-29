import crypto from 'node:crypto';
import { google } from 'googleapis';

export const EXPECTED_HISTORICAL_SPREADSHEET_ID = '1VKZgdAwWURAkACKSUrEGSoNib1xQaQ7zzpBGfwneOeI';
export const EXPECTED_HISTORICAL_WORKSHEET_GID = 969595299;
export const GOOGLE_SHEETS_READONLY_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';

const REQUIRED_CONFIG_KEYS = ['GOOGLE_SPREADSHEET_ID', 'GOOGLE_SHEET_TAB', 'GOOGLE_SERVICE_ACCOUNT_JSON'] as const;

export type GoogleConfigKey = (typeof REQUIRED_CONFIG_KEYS)[number];

export type GoogleConfigStatus =
  | 'present'
  | 'missing'
  | 'malformed'
  | 'unexpected_spreadsheet'
  | 'authentication_failed'
  | 'worksheet_missing'
  | 'worksheet_mismatch';

export type PrivacyClassification = 'none' | 'direct_identifier' | 'sensitive_text' | 'photo_reference' | 'payment_sensitive';
export type ModelingEligibility = 'eligible' | 'exclude' | 'target_only' | 'post_quote_only' | 'requires_review';
export type InferredColumnType = 'date' | 'currency' | 'percentage' | 'number' | 'boolean' | 'category' | 'text' | 'empty';

export type HistoricalSheetAuditSummary = {
  config: Record<GoogleConfigKey, GoogleConfigStatus>;
  worksheetName?: string;
  worksheetGid?: number;
  totalRows?: number;
  nonEmptyRecords?: number;
  headers?: string[];
  blockedReason?: string;
};

export type HistoricalSheetAudit = HistoricalSheetAuditSummary & {
  source?: SourceAudit;
  schema?: ColumnAudit[];
  quality?: DataQualityAudit;
  outcomeAvailability?: Record<string, OutcomeAvailability>;
  privacy?: PrivacyAudit;
  targets?: TargetReadiness[];
  snapshotManifest?: SnapshotManifest;
  readiness?: ReadinessSummary;
};

export type SourceAudit = {
  spreadsheetId: string;
  tabName: string;
  worksheetGid?: number;
  rowCount: number;
  columnCount: number;
  totalRows: number;
  nonEmptyRows: number;
  headerRow: string[];
  earliestDate: string | null;
  latestDate: string | null;
  coverageEndsAroundJuneFirst2026: boolean | null;
  newerCompletedJobsMayBeMissing: boolean | null;
};

export type ColumnAudit = {
  originalHeader: string;
  canonicalField: string;
  inferredType: InferredColumnType;
  unit: string | null;
  required: boolean;
  modelingEligibility: ModelingEligibility;
  privacy: PrivacyClassification;
  missingPercentage: number;
  invalidPercentage: number;
  uniqueValueCount: number | null;
  normalizationRequired: boolean;
};

export type DataQualityAudit = {
  duplicateRows: number;
  duplicateRowRate: number;
  likelyDuplicateJobs: number;
  missingIdentifiers: number;
  missingDates: number;
  invalidDates: number;
  missingPrices: number;
  invalidPrices: number;
  zeroOrNegativePrices: number;
  inconsistentCurrencyFormats: number;
  inconsistentCityNames: boolean;
  inconsistentServiceTypes: boolean;
  inconsistentStatusValues: boolean;
  outlierCounts: Record<string, number>;
  freeTextColumnCount: number;
  nonCompletedRows: number;
  blankTrailingRows: number;
  formulaCellColumns: string[];
  mergedHeaderComplications: boolean;
  inconsistentUnits: boolean;
};

export type OutcomeAvailability = {
  available: boolean;
  canonicalField?: string;
  eligibleRows: number;
  missingRate: number;
};

export type PrivacyAudit = {
  directIdentifiers: string[];
  sensitiveText: string[];
  photoReferences: string[];
  paymentSensitive: string[];
  excludeFromTraining: string[];
  pseudonymize: string[];
  generalize: string[];
  redact: string[];
  accessRestricted: string[];
  operationsOnly: string[];
};

export type TargetReadiness = {
  target: string;
  supported: boolean;
  eligibleRows: number;
  missingRate: number;
  labelReliability: 'unknown' | 'low' | 'medium' | 'high';
  leakageRisks: string[];
  minimumDataRequired: string;
  baseline: string;
  metric: string;
  managerReviewRequired: boolean;
};

export type SnapshotManifest = {
  snapshotId: string;
  retrievalTimestamp: string;
  sourceAlias: string;
  tabName: string;
  headerSchemaVersion: string;
  rowCount: number;
  eligibleRowCount: number;
  excludedRowCount: number;
  dateRange: { earliest: string | null; latest: string | null };
  dataQualitySummary: Pick<DataQualityAudit, 'duplicateRows' | 'missingDates' | 'missingPrices' | 'nonCompletedRows'>;
  redactedExclusionReasons: Record<string, number>;
  datasetChecksum: string;
  featureDefinitionVersion: string;
  targetDefinitionVersion: string;
  codeCommit: string;
};

export type ReadinessSummary = {
  rating: 'blocked' | 'reporting_only' | 'baseline_ready' | 'ml_candidate' | 'production_ml_ready';
  supportsReporting: boolean;
  supportsComparableRetrieval: boolean;
  supportsStatisticalBaselines: boolean;
  supportsGradientBoostedModels: boolean;
  supportsProductionMl: boolean;
  blockers: string[];
};

type ServiceAccountJson = {
  client_email?: string;
  private_key?: string;
  [key: string]: unknown;
};

type SheetFetchResult = {
  worksheetName: string;
  worksheetGid?: number;
  rowCount: number;
  columnCount: number;
  rows: string[][];
};

export function getGoogleConfigPresence(env = process.env): HistoricalSheetAuditSummary['config'] {
  return {
    GOOGLE_SPREADSHEET_ID: env.GOOGLE_SPREADSHEET_ID ? 'present' : 'missing',
    GOOGLE_SHEET_TAB: env.GOOGLE_SHEET_TAB ? 'present' : 'missing',
    GOOGLE_SERVICE_ACCOUNT_JSON: env.GOOGLE_SERVICE_ACCOUNT_JSON ? 'present' : 'missing'
  };
}

export function parseServiceAccountJson(raw: string): ServiceAccountJson {
  try {
    const parsed = JSON.parse(raw) as ServiceAccountJson;
    if (!parsed.client_email || !parsed.private_key) {
      throw new Error('missing required service account fields');
    }
    return {
      ...parsed,
      private_key: parsed.private_key.replace(/\\n/g, '\n')
    };
  } catch {
    throw new Error('Malformed Google service-account configuration.');
  }
}

export function normalizeHeader(header: string) {
  return header
    .trim()
    .toLowerCase()
    .replace(/[$%#]/g, ' ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function canonicalFieldForHeader(header: string) {
  const normalized = normalizeHeader(header);
  const compact = normalized.replace(/_/g, '');
  const exact: Record<string, string> = {
    opportunity_id: 'opportunity_id',
    estimate_id: 'estimate_id',
    job_id: 'job_id',
    customer_id: 'customer_id',
    estimate_date: 'estimate_date',
    completion_date: 'completion_date',
    completed_date: 'completion_date',
    service_type: 'service_type',
    city: 'city',
    status: 'status',
    quote_status: 'quote_status',
    quoted_price: 'final_quoted_price',
    final_price: 'final_completed_price',
    completed_price: 'final_completed_price',
    actual_loads: 'actual_load_count',
    actual_load_count: 'actual_load_count',
    labor_hours: 'labor_hours',
    disposal_cost: 'disposal_cost',
    disposal_weight: 'disposal_weight',
    gross_margin: 'gross_margin',
    override_reason: 'override_reason',
    loss_reason: 'loss_reason',
    notes: 'notes',
    photo: 'photo_reference'
  };
  if (exact[normalized]) return exact[normalized];
  if (compact.includes('phone')) return 'customer_phone';
  if (compact.includes('email')) return 'customer_email';
  if (compact.includes('address') || compact.includes('street')) return 'street_address';
  if (compact.includes('customer') && compact.includes('name')) return 'customer_name';
  if (compact.includes('opportunity')) return 'opportunity_id';
  if (compact.includes('estimate') && compact.includes('id')) return 'estimate_id';
  if (compact.includes('date') && compact.includes('complete')) return 'completion_date';
  if (compact.includes('date')) return 'estimate_date';
  if (compact.includes('service') || compact.includes('jobtype')) return 'service_type';
  if (compact.includes('city') || compact.includes('zip') || compact.includes('zone')) return 'geography';
  if (compact.includes('status')) return 'status';
  if (compact.includes('quote') && compact.includes('price')) return 'final_quoted_price';
  if (compact.includes('final') && (compact.includes('price') || compact.includes('revenue'))) return 'final_completed_price';
  if (normalized === 'price' || compact.includes('revenue') || compact.includes('amount')) return 'final_completed_price';
  if (compact.includes('price')) return 'price';
  if (compact.includes('load')) return compact.includes('actual') ? 'actual_load_count' : 'estimated_load_count';
  if (compact.includes('hour')) return 'labor_hours';
  if (compact.includes('worker')) return 'workers';
  if (compact.includes('mile')) return 'mileage';
  if (compact.includes('travel')) return 'travel_time';
  if (compact.includes('disposal') && compact.includes('weight')) return 'disposal_weight';
  if (compact.includes('disposal') && compact.includes('cost')) return 'disposal_cost';
  if (compact.includes('cost')) return 'direct_job_cost';
  if (compact.includes('margin')) return 'gross_margin';
  if (compact.includes('override')) return 'override_reason';
  if (compact.includes('loss') || compact.includes('cancel')) return 'loss_reason';
  if (compact.includes('photo') || compact.includes('image')) return 'photo_reference';
  if (compact.includes('note') || compact.includes('description')) return 'notes';
  return normalized || 'unnamed_column';
}

export function parseCurrency(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed || /^n\/?a$/i.test(trimmed)) return null;
  const negative = /^\(.*\)$/.test(trimmed) || /^-/.test(trimmed);
  const numeric = Number(trimmed.replace(/[,$()\s]/g, ''));
  if (!Number.isFinite(numeric)) return null;
  return negative ? -Math.abs(numeric) : numeric;
}

export function parsePercent(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const numeric = Number(trimmed.replace('%', '').trim());
  if (!Number.isFinite(numeric)) return null;
  return trimmed.includes('%') ? numeric / 100 : numeric;
}

export function parseAuditDate(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^(yes|no|true|false|won|lost|complete|completed)$/i.test(trimmed)) return null;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

export function parseBooleanLike(value: string): boolean | null {
  const trimmed = value.trim().toLowerCase();
  if (['yes', 'true', 'y', '1', 'won', 'complete', 'completed'].includes(trimmed)) return true;
  if (['no', 'false', 'n', '0', 'lost', 'incomplete'].includes(trimmed)) return false;
  return null;
}

export function classifyPrivacyField(header: string, canonicalField = canonicalFieldForHeader(header)): PrivacyClassification {
  const normalized = normalizeHeader(`${header} ${canonicalField}`);
  if (/phone|email|customer_name|street_address|address/.test(normalized)) return 'direct_identifier';
  if (/payment|card|venmo|zelle|check|invoice/.test(normalized)) return 'payment_sensitive';
  if (/photo|image|url|link/.test(normalized)) return 'photo_reference';
  if (/note|description|comment|reason/.test(normalized)) return 'sensitive_text';
  return 'none';
}

export function modelingEligibilityForField(canonicalField: string, privacy: PrivacyClassification): ModelingEligibility {
  if (privacy === 'direct_identifier' || privacy === 'payment_sensitive') return 'exclude';
  if (privacy === 'sensitive_text' || privacy === 'photo_reference') return 'requires_review';
  if (/final|actual|completion|completed|accepted|loss|margin|override/.test(canonicalField)) return 'post_quote_only';
  if (/price|cost|load_count|labor_hours|disposal_weight|quote_acceptance|underpricing/.test(canonicalField)) return 'target_only';
  return 'eligible';
}

export function analyzeHistoricalRows(rows: string[][], options: {
  spreadsheetId: string;
  tabName: string;
  worksheetGid?: number;
  retrievalTimestamp?: string;
  codeCommit?: string;
}): HistoricalSheetAudit {
  const headerRow = (rows[0] || []).map((cell) => String(cell || '').trim());
  const records = rows.slice(1);
  const nonEmptyRecords = records.filter((row) => row.some((cell) => String(cell || '').trim().length > 0));
  const canonicalHeaders = headerRow.map(canonicalFieldForHeader);
  const columnCount = headerRow.length;
  const rowWidth = Math.max(columnCount, ...rows.map((row) => row.length), 0);
  const sourceDates = collectDates(nonEmptyRecords, canonicalHeaders);
  const quality = analyzeQuality(nonEmptyRecords, canonicalHeaders);
  const schema = headerRow.map((header, index) => auditColumn(header, canonicalHeaders[index], nonEmptyRecords.map((row) => String(row[index] || ''))));
  const outcomeAvailability = buildOutcomeAvailability(nonEmptyRecords, canonicalHeaders);
  const privacy = buildPrivacyAudit(schema);
  const targets = buildTargetReadiness(outcomeAvailability, nonEmptyRecords.length);
  const readiness = buildReadinessSummary(nonEmptyRecords.length, outcomeAvailability, quality);
  const manifest = buildSnapshotManifest(nonEmptyRecords, canonicalHeaders, quality, {
    retrievalTimestamp: options.retrievalTimestamp || new Date().toISOString(),
    tabName: options.tabName,
    codeCommit: options.codeCommit || 'unknown'
  }, sourceDates);

  return {
    config: {
      GOOGLE_SPREADSHEET_ID: 'present',
      GOOGLE_SHEET_TAB: 'present',
      GOOGLE_SERVICE_ACCOUNT_JSON: 'present'
    },
    worksheetName: options.tabName,
    worksheetGid: options.worksheetGid,
    totalRows: rows.length,
    nonEmptyRecords: nonEmptyRecords.length,
    headers: headerRow,
    source: {
      spreadsheetId: options.spreadsheetId,
      tabName: options.tabName,
      worksheetGid: options.worksheetGid,
      rowCount: rows.length,
      columnCount: rowWidth,
      totalRows: rows.length,
      nonEmptyRows: nonEmptyRecords.length,
      headerRow,
      earliestDate: sourceDates.earliest,
      latestDate: sourceDates.latest,
      coverageEndsAroundJuneFirst2026: sourceDates.latest ? sourceDates.latest <= '2026-06-07' && sourceDates.latest >= '2026-05-25' : null,
      newerCompletedJobsMayBeMissing: sourceDates.latest ? sourceDates.latest < '2026-08-01' : null
    },
    schema,
    quality,
    outcomeAvailability,
    privacy,
    targets,
    snapshotManifest: manifest,
    readiness
  };
}

export async function readHistoricalSheetSummary(env = process.env): Promise<HistoricalSheetAuditSummary> {
  const fetched = await readHistoricalSheetAudit(env);
  if (fetched.blockedReason) return fetched;
  return {
    config: fetched.config,
    worksheetName: fetched.worksheetName,
    worksheetGid: fetched.worksheetGid,
    totalRows: fetched.totalRows,
    nonEmptyRecords: fetched.nonEmptyRecords,
    headers: fetched.headers
  };
}

export async function readHistoricalSheetAudit(env = process.env, codeCommit = 'unknown'): Promise<HistoricalSheetAudit> {
  const config = getGoogleConfigPresence(env);
  if (Object.values(config).some((status) => status === 'missing')) {
    return { config, blockedReason: 'Required Google Sheets environment configuration is unavailable.' };
  }

  if (env.GOOGLE_SPREADSHEET_ID !== EXPECTED_HISTORICAL_SPREADSHEET_ID) {
    return {
      config: { ...config, GOOGLE_SPREADSHEET_ID: 'unexpected_spreadsheet' },
      blockedReason: 'Configured spreadsheet does not match the expected historical spreadsheet.'
    };
  }

  let fetched: SheetFetchResult;
  try {
    fetched = await fetchHistoricalSheet(env);
  } catch (error) {
    return {
      config: { ...config, ...classifySheetAccessError(error) },
      blockedReason: redactError(error)
    };
  }

  return analyzeHistoricalRows(fetched.rows, {
    spreadsheetId: env.GOOGLE_SPREADSHEET_ID,
    tabName: fetched.worksheetName,
    worksheetGid: fetched.worksheetGid,
    codeCommit
  });
}

async function fetchHistoricalSheet(env: NodeJS.ProcessEnv): Promise<SheetFetchResult> {
  let credentials: ServiceAccountJson;
  try {
    credentials = parseServiceAccountJson(env.GOOGLE_SERVICE_ACCOUNT_JSON || '');
  } catch (error) {
    throw Object.assign(error as Error, { code: 'malformed' });
  }

  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: [GOOGLE_SHEETS_READONLY_SCOPE]
  });
  const sheets = google.sheets({ version: 'v4', auth });

  const metadata = await sheets.spreadsheets.get({
    spreadsheetId: env.GOOGLE_SPREADSHEET_ID,
    fields: 'sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))'
  });
  const expectedSheet = metadata.data.sheets?.find((sheet) => sheet.properties?.sheetId === EXPECTED_HISTORICAL_WORKSHEET_GID);
  const configuredSheet = metadata.data.sheets?.find((sheet) => sheet.properties?.title === env.GOOGLE_SHEET_TAB);

  if (!configuredSheet) throw Object.assign(new Error('Configured worksheet was not found.'), { code: 'worksheet_missing' });
  if (!expectedSheet || expectedSheet.properties?.title !== configuredSheet.properties?.title) {
    throw Object.assign(new Error('Configured worksheet does not match the expected worksheet GID.'), { code: 'worksheet_mismatch' });
  }

  const values = await sheets.spreadsheets.values.get({
    spreadsheetId: env.GOOGLE_SPREADSHEET_ID,
    range: `'${env.GOOGLE_SHEET_TAB}'`,
    valueRenderOption: 'FORMATTED_VALUE',
    dateTimeRenderOption: 'FORMATTED_STRING'
  });

  return {
    worksheetName: configuredSheet.properties?.title || env.GOOGLE_SHEET_TAB || '',
    worksheetGid: configuredSheet.properties?.sheetId || undefined,
    rowCount: configuredSheet.properties?.gridProperties?.rowCount || 0,
    columnCount: configuredSheet.properties?.gridProperties?.columnCount || 0,
    rows: (values.data.values || []).map((row) => row.map((cell) => String(cell || '')))
  };
}

function classifySheetAccessError(error: unknown): Partial<Record<GoogleConfigKey, GoogleConfigStatus>> {
  const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code) : '';
  if (code === 'malformed') return { GOOGLE_SERVICE_ACCOUNT_JSON: 'malformed' };
  if (code === 'worksheet_missing') return { GOOGLE_SHEET_TAB: 'worksheet_missing' };
  if (code === 'worksheet_mismatch') return { GOOGLE_SHEET_TAB: 'worksheet_mismatch' };
  return { GOOGLE_SERVICE_ACCOUNT_JSON: 'authentication_failed' };
}

export function redactError(error: unknown) {
  const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code) : '';
  if (code === 'malformed') return 'Google service-account configuration is malformed.';
  if (code === 'worksheet_missing') return 'Configured worksheet was not found.';
  if (code === 'worksheet_mismatch') return 'Configured worksheet does not match the expected completed-job worksheet.';
  return 'Read-only Google Sheets access failed.';
}

function auditColumn(originalHeader: string, canonicalField: string, values: string[]): ColumnAudit {
  const nonBlankValues = values.filter((value) => value.trim().length > 0);
  const inferredType = inferType(canonicalField, nonBlankValues);
  const invalidCount = nonBlankValues.filter((value) => !isValidValueForType(value, inferredType)).length;
  const privacy = classifyPrivacyField(originalHeader, canonicalField);
  return {
    originalHeader,
    canonicalField,
    inferredType,
    unit: inferUnit(canonicalField, originalHeader),
    required: isRequiredField(canonicalField),
    modelingEligibility: modelingEligibilityForField(canonicalField, privacy),
    privacy,
    missingPercentage: percentage(values.length - nonBlankValues.length, Math.max(values.length, 1)),
    invalidPercentage: percentage(invalidCount, Math.max(nonBlankValues.length, 1)),
    uniqueValueCount: shouldReportUniqueCount(privacy, inferredType) ? new Set(nonBlankValues.map((value) => normalizeCategory(value))).size : null,
    normalizationRequired: requiresNormalization(originalHeader, canonicalField, nonBlankValues)
  };
}

function inferType(canonicalField: string, values: string[]): InferredColumnType {
  if (values.length === 0) return 'empty';
  if (/date/.test(canonicalField)) return 'date';
  if (/stairs|heavy_items|demo_required|won_job|completed/.test(canonicalField)) return 'boolean';
  if (/price|cost|revenue|margin/.test(canonicalField)) return 'currency';
  if (/percent|rate/.test(canonicalField)) return 'percentage';
  if (/count|hours|mileage|time|weight|workers|loads/.test(canonicalField)) return 'number';
  if (/accepted|completed|cancelled/.test(canonicalField)) return 'boolean';
  const sample = values.slice(0, 25);
  if (sample.every((value) => parseBooleanLike(value) !== null)) return 'boolean';
  if (sample.every((value) => parseAuditDate(value))) return 'date';
  if (sample.every((value) => parseCurrency(value) !== null)) return 'currency';
  if (sample.every((value) => parsePercent(value) !== null)) return 'percentage';
  if (sample.every((value) => Number.isFinite(Number(value)))) return 'number';
  return new Set(sample.map(normalizeCategory)).size <= Math.max(12, Math.ceil(sample.length * 0.65)) ? 'category' : 'text';
}

function isValidValueForType(value: string, type: InferredColumnType) {
  if (type === 'date') return parseAuditDate(value) !== null;
  if (type === 'currency') return parseCurrency(value) !== null;
  if (type === 'percentage') return parsePercent(value) !== null;
  if (type === 'number') return Number.isFinite(Number(value.replace(/,/g, '').trim()));
  if (type === 'boolean') return parseBooleanLike(value) !== null;
  return true;
}

function inferUnit(canonicalField: string, header: string) {
  const normalized = normalizeHeader(`${canonicalField} ${header}`);
  if (/price|cost|revenue|margin/.test(normalized)) return 'USD';
  if (/percent|rate/.test(normalized)) return 'fraction';
  if (/weight/.test(normalized)) return normalized.includes('lb') ? 'lb' : 'unknown_weight';
  if (/hour/.test(normalized)) return 'hours';
  if (/mile/.test(normalized)) return 'miles';
  if (/time/.test(normalized)) return 'minutes';
  if (/date/.test(normalized)) return 'date';
  return null;
}

function isRequiredField(canonicalField: string) {
  return /opportunity_id|job_id|estimate_date|service_type|status|final_completed_price/.test(canonicalField);
}

function shouldReportUniqueCount(privacy: PrivacyClassification, inferredType: InferredColumnType) {
  return privacy === 'none' && ['category', 'boolean', 'number', 'date'].includes(inferredType);
}

function requiresNormalization(header: string, canonicalField: string, values: string[]) {
  return normalizeHeader(header) !== canonicalField || values.some((value) => value.trim() !== normalizeCategory(value) && value.trim().toLowerCase() === normalizeCategory(value));
}

function analyzeQuality(records: string[][], canonicalHeaders: string[]): DataQualityAudit {
  const normalizedRows = records.map((row) => canonicalHeaders.map((_, index) => String(row[index] || '').trim()).join('\u001f'));
  const duplicateRows = countDuplicates(normalizedRows);
  const idIndexes = indexesMatching(canonicalHeaders, /opportunity_id|estimate_id|job_id/);
  const dateIndexes = indexesMatching(canonicalHeaders, /date/);
  const priceIndexes = indexesMatching(canonicalHeaders, /price|cost|revenue/);
  const cityIndexes = indexesMatching(canonicalHeaders, /city|geography/);
  const serviceIndexes = indexesMatching(canonicalHeaders, /service_type/);
  const statusIndexes = indexesMatching(canonicalHeaders, /status/);
  const formulaColumns = canonicalHeaders.filter((_, columnIndex) => records.some((row) => String(row[columnIndex] || '').trim().startsWith('=')));

  return {
    duplicateRows,
    duplicateRowRate: percentage(duplicateRows, Math.max(records.length, 1)),
    likelyDuplicateJobs: countLikelyDuplicateJobs(records, canonicalHeaders),
    missingIdentifiers: countRowsWhere(records, (row) => idIndexes.length === 0 || idIndexes.every((index) => !String(row[index] || '').trim())),
    missingDates: countRowsWhere(records, (row) => dateIndexes.length === 0 || dateIndexes.every((index) => !String(row[index] || '').trim())),
    invalidDates: countInvalid(records, dateIndexes, parseAuditDate),
    missingPrices: countRowsWhere(records, (row) => priceIndexes.length === 0 || priceIndexes.every((index) => !String(row[index] || '').trim())),
    invalidPrices: countInvalid(records, priceIndexes, parseCurrency),
    zeroOrNegativePrices: countRowsWhere(records, (row) => priceIndexes.some((index) => {
      const parsed = parseCurrency(String(row[index] || ''));
      return parsed !== null && parsed <= 0;
    })),
    inconsistentCurrencyFormats: countMixedCurrencyFormats(records, priceIndexes),
    inconsistentCityNames: hasInconsistentCategories(records, cityIndexes),
    inconsistentServiceTypes: hasInconsistentCategories(records, serviceIndexes),
    inconsistentStatusValues: hasInconsistentCategories(records, statusIndexes),
    outlierCounts: countOutliers(records, canonicalHeaders),
    freeTextColumnCount: canonicalHeaders.filter((header) => header === 'notes' || header.includes('reason')).length,
    nonCompletedRows: countNonCompletedRows(records, canonicalHeaders),
    blankTrailingRows: countBlankTrailingRows(records),
    formulaCellColumns: Array.from(new Set(formulaColumns)),
    mergedHeaderComplications: canonicalHeaders.some((header) => !header || header === 'unnamed_column'),
    inconsistentUnits: false
  };
}

function buildOutcomeAvailability(records: string[][], canonicalHeaders: string[]) {
  const requested = {
    opportunityId: /opportunity_id/,
    estimateId: /estimate_id/,
    customerSafeJobId: /job_id|opportunity_id|estimate_id/,
    estimateDate: /estimate_date/,
    completionDate: /completion_date/,
    serviceType: /service_type/,
    cityOrGeography: /city|geography/,
    originalQuotedPrice: /final_quoted_price|quoted_price/,
    acceptedPrice: /accepted_price|final_quoted_price/,
    finalCompletedPrice: /final_completed_price|completed_price|price/,
    quoteAccepted: /accepted|won_job|status/,
    lostCancelledOutcome: /loss_reason|status/,
    lossReason: /loss_reason/,
    estimatedLoad: /estimated_load/,
    actualLoad: /actual_load_count/,
    estimatedNumberOfLoads: /estimated_load_count/,
    actualNumberOfLoads: /actual_load_count/,
    workers: /workers/,
    laborHours: /labor_hours/,
    mileage: /mileage/,
    travelTime: /travel_time/,
    disposalFacility: /disposal_facility/,
    disposalWeight: /disposal_weight/,
    disposalCost: /disposal_cost/,
    materialType: /material_type|service_type/,
    accessDifficulty: /difficulty|access/,
    stairsElevator: /stairs|elevator/,
    carryDistance: /carry/,
    disassembly: /disassembly/,
    demolition: /demolition/,
    leadSource: /lead_source/,
    directJobCost: /direct_job_cost/,
    grossMargin: /gross_margin/,
    managerOverride: /override/,
    overrideReason: /override_reason/,
    employeeCorrectionNotes: /notes/,
    photographReferences: /photo_reference/,
    modelVersion: /model_version/,
    promptVersion: /prompt_version/,
    pricingRuleVersion: /pricing_rule_version/
  };
  return Object.fromEntries(Object.entries(requested).map(([key, pattern]) => [key, availabilityFor(records, canonicalHeaders, pattern)]));
}

function availabilityFor(records: string[][], canonicalHeaders: string[], pattern: RegExp): OutcomeAvailability {
  const index = canonicalHeaders.findIndex((header) => pattern.test(header));
  if (index === -1) return { available: false, eligibleRows: 0, missingRate: 1 };
  const presentRows = records.filter((row) => String(row[index] || '').trim()).length;
  return {
    available: true,
    canonicalField: canonicalHeaders[index],
    eligibleRows: presentRows,
    missingRate: 1 - presentRows / Math.max(records.length, 1)
  };
}

function buildPrivacyAudit(schema: ColumnAudit[]): PrivacyAudit {
  const byPrivacy = (privacy: PrivacyClassification) => schema.filter((column) => column.privacy === privacy).map((column) => column.canonicalField);
  const directIdentifiers = byPrivacy('direct_identifier');
  const sensitiveText = byPrivacy('sensitive_text');
  const photoReferences = byPrivacy('photo_reference');
  const paymentSensitive = byPrivacy('payment_sensitive');
  return {
    directIdentifiers,
    sensitiveText,
    photoReferences,
    paymentSensitive,
    excludeFromTraining: [...directIdentifiers, ...paymentSensitive],
    pseudonymize: schema.filter((column) => /job_id|opportunity_id|estimate_id|customer_id/.test(column.canonicalField)).map((column) => column.canonicalField),
    generalize: schema.filter((column) => /address|city|geography|zip/.test(column.canonicalField)).map((column) => column.canonicalField),
    redact: [...sensitiveText],
    accessRestricted: [...directIdentifiers, ...sensitiveText, ...photoReferences, ...paymentSensitive],
    operationsOnly: [...directIdentifiers, ...paymentSensitive]
  };
}

function buildTargetReadiness(outcomes: Record<string, OutcomeAvailability>, totalRows: number): TargetReadiness[] {
  const targets = [
    ['Compacted load percentage', outcomes.actualLoad, 'median absolute load percentage error'],
    ['Actual number of loads', outcomes.actualNumberOfLoads, 'mean absolute load-count error'],
    ['Labor hours', outcomes.laborHours, 'mean absolute hour error'],
    ['Disposal weight', outcomes.disposalWeight, 'mean absolute weight error'],
    ['Disposal cost', outcomes.disposalCost, 'mean absolute cost error'],
    ['Direct job cost', outcomes.directJobCost, 'mean absolute cost error'],
    ['Final completed price', outcomes.finalCompletedPrice, 'mean absolute price error'],
    ['Gross margin', outcomes.grossMargin, 'mean absolute margin error'],
    ['Quote acceptance probability', outcomes.quoteAccepted, 'calibration and log loss'],
    ['Underpricing risk', outcomes.finalCompletedPrice, 'underpricing frequency']
  ] as const;
  return targets.map(([target, availability, metric]) => ({
    target,
    supported: isTargetSupported(target, availability, totalRows),
    eligibleRows: availability.eligibleRows,
    missingRate: availability.missingRate,
    labelReliability: availability.available ? (availability.missingRate < 0.1 ? 'medium' : 'low') : 'unknown',
    leakageRisks: leakageRisksForTarget(target),
    minimumDataRequired: 'At least 100 validated, completed, post-quote-safe labels are recommended before model comparison; 300+ is preferred for categorical imbalance checks.',
    baseline: target.includes('probability') ? 'historical acceptance rate by service and time period' : 'current deterministic pricing rules plus median by service/load category',
    metric,
    managerReviewRequired: true
  }));
}

function isTargetSupported(target: string, availability: OutcomeAvailability, totalRows: number) {
  if (!availability.available) return false;
  if (/acceptance/i.test(target)) return availability.eligibleRows >= 100 && availability.missingRate < 0.2;
  if (/gross margin/i.test(target)) return availability.eligibleRows >= 100 && availability.missingRate < 0.2;
  return availability.eligibleRows >= Math.min(50, Math.max(10, totalRows * 0.5));
}

function buildReadinessSummary(totalRows: number, outcomes: Record<string, OutcomeAvailability>, quality: DataQualityAudit): ReadinessSummary {
  const hasPrice = outcomes.finalCompletedPrice?.available || false;
  const hasService = outcomes.serviceType?.available || false;
  const hasDates = outcomes.estimateDate?.available || outcomes.completionDate?.available || false;
  const hasOperationalTargets = Boolean(outcomes.actualLoad?.available || outcomes.laborHours?.available || outcomes.disposalCost?.available);
  const supportsReporting = totalRows > 0 && hasDates && hasPrice;
  const supportsBaselines = supportsReporting && hasService && totalRows >= 30;
  const supportsComparable = supportsBaselines && hasOperationalTargets;
  const supportsGbm = supportsComparable && totalRows >= 300 && quality.duplicateRowRate < 0.1;
  const blockers = [];
  if (!supportsReporting) blockers.push('Verified date and final price labels are required.');
  if (!hasOperationalTargets) blockers.push('Actual load, labor, or disposal outcome labels are required for operational-cost modeling.');
  if (totalRows < 300) blockers.push('Dataset is likely too small for reliable boosted-tree model promotion.');
  return {
    rating: supportsGbm ? 'ml_candidate' : supportsBaselines ? 'baseline_ready' : supportsReporting ? 'reporting_only' : 'blocked',
    supportsReporting,
    supportsComparableRetrieval: supportsComparable,
    supportsStatisticalBaselines: supportsBaselines,
    supportsGradientBoostedModels: supportsGbm,
    supportsProductionMl: false,
    blockers
  };
}

function buildSnapshotManifest(records: string[][], canonicalHeaders: string[], quality: DataQualityAudit, context: {
  retrievalTimestamp: string;
  tabName: string;
  codeCommit: string;
}, dates: { earliest: string | null; latest: string | null }): SnapshotManifest {
  const eligibleRows = records.filter((row) => isCompletedRow(row, canonicalHeaders)).length;
  const exclusionReasons = {
    non_completed_or_unknown_status: records.length - eligibleRows,
    missing_date: quality.missingDates,
    missing_price: quality.missingPrices,
    duplicate_row: quality.duplicateRows
  };
  const checksumRows = records.map((row) => pseudonymizedTrainingRow(row, canonicalHeaders));
  const checksum = crypto.createHash('sha256').update(JSON.stringify(checksumRows)).digest('hex');
  const datePart = context.retrievalTimestamp.slice(0, 10).replace(/-/g, '');
  return {
    snapshotId: `whs-history-${datePart}-${checksum.slice(0, 12)}`,
    retrievalTimestamp: context.retrievalTimestamp,
    sourceAlias: 'expected-whs-completed-jobs-sheet',
    tabName: context.tabName,
    headerSchemaVersion: 'historical-sheet-v1',
    rowCount: records.length,
    eligibleRowCount: eligibleRows,
    excludedRowCount: records.length - eligibleRows,
    dateRange: { earliest: dates.earliest, latest: dates.latest },
    dataQualitySummary: {
      duplicateRows: quality.duplicateRows,
      missingDates: quality.missingDates,
      missingPrices: quality.missingPrices,
      nonCompletedRows: quality.nonCompletedRows
    },
    redactedExclusionReasons: exclusionReasons,
    datasetChecksum: checksum,
    featureDefinitionVersion: 'whs-feature-dictionary-v1',
    targetDefinitionVersion: 'whs-target-definitions-v1',
    codeCommit: context.codeCommit
  };
}

function pseudonymizedTrainingRow(row: string[], canonicalHeaders: string[]) {
  return Object.fromEntries(canonicalHeaders.map((header, index) => {
    const raw = String(row[index] || '').trim();
    const privacy = classifyPrivacyField(header, header);
    if (privacy === 'direct_identifier' || privacy === 'payment_sensitive' || privacy === 'sensitive_text' || privacy === 'photo_reference') {
      return [header, raw ? '[redacted-present]' : ''];
    }
    if (/city|geography|zip/.test(header)) return [header, normalizeCategory(raw)];
    return [header, normalizeCategory(raw)];
  }));
}

function collectDates(records: string[][], canonicalHeaders: string[]) {
  const dateIndexes = indexesMatching(canonicalHeaders, /date/);
  const dates = records.flatMap((row) => dateIndexes.map((index) => parseAuditDate(String(row[index] || ''))).filter(Boolean) as string[]);
  dates.sort();
  return { earliest: dates[0] || null, latest: dates[dates.length - 1] || null };
}

function indexesMatching(headers: string[], pattern: RegExp) {
  return headers.map((header, index) => ({ header, index })).filter(({ header }) => pattern.test(header)).map(({ index }) => index);
}

function countRowsWhere(records: string[][], predicate: (row: string[]) => boolean) {
  return records.filter(predicate).length;
}

function countInvalid(records: string[][], indexes: number[], parser: (value: string) => unknown) {
  if (indexes.length === 0) return 0;
  return records.reduce((total, row) => total + indexes.filter((index) => {
    const value = String(row[index] || '').trim();
    return value && parser(value) === null;
  }).length, 0);
}

function countDuplicates(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return Array.from(counts.values()).reduce((total, count) => total + Math.max(0, count - 1), 0);
}

function countLikelyDuplicateJobs(records: string[][], canonicalHeaders: string[]) {
  const keyIndexes = indexesMatching(canonicalHeaders, /opportunity_id|estimate_id|job_id|estimate_date|service_type|city|geography|final_completed_price|price/);
  if (keyIndexes.length < 2) return 0;
  return countDuplicates(records.map((row) => keyIndexes.map((index) => normalizeCategory(String(row[index] || ''))).join('|')));
}

function countMixedCurrencyFormats(records: string[][], priceIndexes: number[]) {
  return priceIndexes.reduce((total, index) => {
    const formats = new Set(records.map((row) => String(row[index] || '').trim()).filter(Boolean).map((value) => value.includes('$') ? 'symbol' : 'plain'));
    return total + (formats.size > 1 ? 1 : 0);
  }, 0);
}

function hasInconsistentCategories(records: string[][], indexes: number[]) {
  return indexes.some((index) => {
    const raw = new Set(records.map((row) => String(row[index] || '').trim()).filter(Boolean));
    const normalized = new Set(Array.from(raw).map(normalizeCategory));
    return raw.size !== normalized.size;
  });
}

function countOutliers(records: string[][], canonicalHeaders: string[]) {
  const output: Record<string, number> = {};
  for (const [index, header] of canonicalHeaders.entries()) {
    if (!/price|cost|load|hours|weight|mileage/.test(header)) continue;
    const values = records.map((row) => parseCurrency(String(row[index] || ''))).filter((value): value is number => value !== null).sort((a, b) => a - b);
    if (values.length < 4) continue;
    const q1 = values[Math.floor(values.length * 0.25)];
    const q3 = values[Math.floor(values.length * 0.75)];
    const iqr = q3 - q1;
    const low = q1 - 1.5 * iqr;
    const high = q3 + 1.5 * iqr;
    output[header] = values.filter((value) => value < low || value > high).length;
  }
  return output;
}

function countNonCompletedRows(records: string[][], canonicalHeaders: string[]) {
  return records.filter((row) => !isCompletedRow(row, canonicalHeaders)).length;
}

function isCompletedRow(row: string[], canonicalHeaders: string[]) {
  const statusIndex = canonicalHeaders.findIndex((header) => /status/.test(header));
  if (statusIndex === -1) return true;
  const status = normalizeCategory(String(row[statusIndex] || ''));
  return /complete|completed|done|paid/.test(status) && !/cancel|lost|declin|void/.test(status);
}

function countBlankTrailingRows(records: string[][]) {
  let count = 0;
  for (let index = records.length - 1; index >= 0; index -= 1) {
    if (records[index].some((cell) => String(cell || '').trim())) break;
    count += 1;
  }
  return count;
}

function leakageRisksForTarget(target: string) {
  const common = ['Do not use final outcome fields as quote-time features.', 'Split repeated customers and duplicate jobs into the same fold.'];
  if (/price|margin|underpricing/i.test(target)) return [...common, 'Human overrides and discounts can encode non-repeatable pricing decisions.'];
  if (/acceptance/i.test(target)) return [...common, 'Post-quote communications and completion fields leak the customer decision.'];
  return [...common, 'Operational actuals are labels, not estimate-time inputs.'];
}

function percentage(numerator: number, denominator: number) {
  return Number((numerator / denominator).toFixed(4));
}

function normalizeCategory(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}
