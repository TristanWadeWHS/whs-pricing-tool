import crypto from 'node:crypto';
import { google } from 'googleapis';

export const EXPECTED_HISTORICAL_SPREADSHEET_ID = '1VKZgdAwWURAkACKSUrEGSoNib1xQaQ7zzpBGfwneOeI';
export const EXPECTED_HISTORICAL_WORKSHEET_GID = 969595299;
export const HISTORICAL_SCHEMA_V2_VERSION = 'historical-outcome-schema-v2';
export const GOOGLE_SHEETS_SCHEMA_WRITE_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
export const EXPECTED_HISTORICAL_WORKSHEET_TITLE = 'ML Data';
export const SCHEMA_V2_BACKUP_TITLE_PREFIX = 'ML Data Backup';

export const HISTORICAL_SCHEMA_V2_COLUMNS = [
  'job_id',
  'model_version',
  'prompt_version',
  'pricing_rule_version',
  'data_schema_version',
  'estimate_source',
  'data_quality_status',
  'original_quoted_price',
  'customer_accepted_price',
  'completion_date',
  'opportunity_outcome',
  'loss_reason',
  'cancellation_reason',
  'actual_load_percent',
  'disposal_facility',
  'disposal_weight',
  'disposal_cost',
  'mileage',
  'travel_time_minutes',
  'equipment_cost',
  'subcontractor_cost',
  'gross_margin_dollars',
  'gross_margin_percent',
  'manager_override',
  'manager_override_reason',
  'employee_correction_notes',
  'photo_reference_id'
] as const;

export type HistoricalSchemaV2Column = (typeof HISTORICAL_SCHEMA_V2_COLUMNS)[number];
export type MigrationMode = 'dry-run' | 'apply';

export type HeaderMapping = {
  header: string;
  normalizedHeader: string;
  canonicalField: string;
};

export type SchemaV2Plan = {
  mappings: HeaderMapping[];
  appendedColumns: HistoricalSchemaV2Column[];
  skippedColumns: Array<{ column: HistoricalSchemaV2Column; equivalentHeader: string; canonicalField: string }>;
};

export type WorksheetManifest = {
  worksheetTitle: string;
  worksheetGid: number;
  valueRowCount: number;
  valueColumnCount: number;
  gridRowCount: number;
  gridColumnCount: number;
  headers: string[];
  verificationHash: string;
};

export type WorksheetSnapshot = WorksheetManifest & {
  rows: string[][];
};

export type BackupResult = {
  title: string;
  gid: number;
  verified: boolean;
  manifest: WorksheetManifest;
};

export type SchemaV2MigrationResult = {
  status: 'ok' | 'blocked';
  mode: MigrationMode;
  blockedReason?: string;
  authFailureCategory?: AuthFailureCategory;
  httpStatus?: number;
  googleErrorReason?: string;
  googleErrorCode?: string;
  spreadsheetId: string;
  worksheetTitle?: string;
  worksheetGid?: number;
  before?: WorksheetManifest;
  after?: WorksheetManifest;
  backup?: BackupResult;
  plan?: SchemaV2Plan;
  sourceManifestUnchanged?: boolean;
  existingCellsUnchanged?: boolean;
  originalHeadersPreserved?: boolean;
  appendedOnly?: boolean;
  sheetModified: boolean;
  secretValuesPrinted: false;
  rawRowsPrinted: false;
};

export type AuthFailureCategory =
  | 'permission_denied'
  | 'invalid_grant'
  | 'invalid_signature'
  | 'key_revoked_or_disabled'
  | 'worksheet_access_denied'
  | 'network_failure'
  | 'clock_skew'
  | 'unknown_authentication_failure';

type SheetProperties = {
  sheetId?: number | null;
  title?: string | null;
  gridProperties?: {
    rowCount?: number | null;
    columnCount?: number | null;
  } | null;
};

type SheetsResponse<T> = Promise<{ data: T }>;

type ServiceAccountJson = {
  client_email?: string;
  private_key?: string;
  [key: string]: unknown;
};

export type SheetsLike = {
  spreadsheets: {
    get(args: unknown): SheetsResponse<{ sheets?: Array<{ properties?: SheetProperties | null }> }>;
    batchUpdate(args: unknown): SheetsResponse<{
      replies?: Array<{ duplicateSheet?: { properties?: SheetProperties | null } }>;
    }>;
    values: {
      get(args: unknown): SheetsResponse<{ values?: unknown[][] }>;
      update(args: unknown): SheetsResponse<unknown>;
    };
  };
};

const SEMANTIC_EQUIVALENTS: Partial<Record<HistoricalSchemaV2Column, string[]>> = {
  job_id: ['job_id', 'opportunity_id', 'estimate_id'],
  original_quoted_price: ['original_quoted_price', 'final_quoted_price', 'quoted_price'],
  customer_accepted_price: ['customer_accepted_price', 'accepted_price'],
  completion_date: ['completion_date'],
  opportunity_outcome: ['opportunity_outcome', 'quote_outcome'],
  loss_reason: ['loss_reason'],
  cancellation_reason: ['cancellation_reason'],
  actual_load_percent: ['actual_load_percent'],
  disposal_facility: ['disposal_facility'],
  disposal_weight: ['disposal_weight'],
  disposal_cost: ['disposal_cost'],
  mileage: ['mileage'],
  travel_time_minutes: ['travel_time_minutes', 'travel_time'],
  equipment_cost: ['equipment_cost'],
  subcontractor_cost: ['subcontractor_cost'],
  gross_margin_dollars: ['gross_margin_dollars'],
  gross_margin_percent: ['gross_margin_percent', 'gross_margin'],
  manager_override: ['manager_override'],
  manager_override_reason: ['manager_override_reason', 'override_reason'],
  employee_correction_notes: ['employee_correction_notes', 'notes'],
  photo_reference_id: ['photo_reference_id', 'photo_reference'],
  model_version: ['model_version'],
  prompt_version: ['prompt_version'],
  pricing_rule_version: ['pricing_rule_version'],
  data_schema_version: ['data_schema_version'],
  estimate_source: ['estimate_source'],
  data_quality_status: ['data_quality_status']
};

export function buildSchemaV2Plan(headers: string[]): SchemaV2Plan {
  const mappings = headers.map((header) => ({
    header,
    normalizedHeader: normalizeHeader(header),
    canonicalField: canonicalFieldForHeader(header)
  }));
  assertNoDuplicateHeaders(mappings);

  const skippedColumns: SchemaV2Plan['skippedColumns'] = [];
  const appendedColumns = HISTORICAL_SCHEMA_V2_COLUMNS.filter((column) => {
    const equivalent = findEquivalentMapping(column, mappings);
    if (!equivalent) return true;
    skippedColumns.push({ column, equivalentHeader: equivalent.header, canonicalField: equivalent.canonicalField });
    return false;
  });

  return { mappings, appendedColumns, skippedColumns };
}

export function assertNoDuplicateHeaders(mappings: HeaderMapping[]) {
  const seen = new Map<string, string>();
  for (const mapping of mappings) {
    if (!mapping.normalizedHeader) continue;
    const prior = seen.get(mapping.normalizedHeader);
    if (prior) throw new Error(`Duplicate or ambiguous normalized header detected: ${mapping.normalizedHeader}`);
    seen.set(mapping.normalizedHeader, mapping.header);
  }
}

export function buildWorksheetManifest(snapshot: Omit<WorksheetSnapshot, 'verificationHash'>): WorksheetManifest {
  return {
    worksheetTitle: snapshot.worksheetTitle,
    worksheetGid: snapshot.worksheetGid,
    valueRowCount: snapshot.valueRowCount,
    valueColumnCount: snapshot.valueColumnCount,
    gridRowCount: snapshot.gridRowCount,
    gridColumnCount: snapshot.gridColumnCount,
    headers: snapshot.headers,
    verificationHash: crypto.createHash('sha256').update(JSON.stringify(normalizeRows(snapshot.rows))).digest('hex')
  };
}

export function manifestsMatch(left: WorksheetManifest, right: WorksheetManifest) {
  return left.valueRowCount === right.valueRowCount
    && left.valueColumnCount === right.valueColumnCount
    && left.verificationHash === right.verificationHash
    && JSON.stringify(left.headers) === JSON.stringify(right.headers);
}

export function verifyAppendOnly(beforeRows: string[][], afterRows: string[][], appendedColumns: string[]) {
  const beforeHeaders = beforeRows[0] || [];
  const afterHeaders = afterRows[0] || [];
  const originalWidth = beforeHeaders.length;
  const existingCellsUnchanged = beforeRows.every((row, rowIndex) => {
    const afterRow = afterRows[rowIndex] || [];
    return Array.from({ length: originalWidth }).every((_, columnIndex) => cell(row, columnIndex) === cell(afterRow, columnIndex));
  });
  return {
    existingCellsUnchanged,
    originalHeadersPreserved: JSON.stringify(afterHeaders.slice(0, originalWidth)) === JSON.stringify(beforeHeaders),
    appendedOnly: JSON.stringify(afterHeaders.slice(originalWidth, originalWidth + appendedColumns.length)) === JSON.stringify(appendedColumns)
      && afterHeaders.length === originalWidth + appendedColumns.length
      && afterRows.length === beforeRows.length
  };
}

export async function runHistoricalSchemaV2Migration(options: {
  env?: NodeJS.ProcessEnv;
  sheets?: SheetsLike;
  mode?: MigrationMode;
  backupTitle?: string;
  now?: Date;
} = {}): Promise<SchemaV2MigrationResult> {
  const env = options.env || process.env;
  const mode = options.mode || 'dry-run';
  const spreadsheetId = env.GOOGLE_SPREADSHEET_ID || '';

  try {
    if (spreadsheetId !== EXPECTED_HISTORICAL_SPREADSHEET_ID) {
      throw new Error('Configured spreadsheet does not match the expected historical spreadsheet.');
    }
    if (mode === 'apply' && env.ALLOW_GOOGLE_SHEET_SCHEMA_WRITE !== 'true') {
      throw new Error('Apply mode requires ALLOW_GOOGLE_SHEET_SCHEMA_WRITE=true.');
    }

    const sheets = options.sheets || createWriteCapableSheetsClient(env);
    const before = await readWorksheetSnapshot(sheets, spreadsheetId, EXPECTED_HISTORICAL_WORKSHEET_GID);
    const plan = buildSchemaV2Plan(before.headers);

    if (mode === 'dry-run') {
      return {
        status: 'ok',
        mode,
        spreadsheetId,
        worksheetTitle: before.worksheetTitle,
        worksheetGid: before.worksheetGid,
        before: stripRows(before),
        plan,
        sheetModified: false,
        secretValuesPrinted: false,
        rawRowsPrinted: false
      };
    }

    if (plan.appendedColumns.length === 0) {
      return {
        status: 'ok',
        mode,
        spreadsheetId,
        worksheetTitle: before.worksheetTitle,
        worksheetGid: before.worksheetGid,
        before: stripRows(before),
        after: stripRows(before),
        plan,
        sourceManifestUnchanged: true,
        existingCellsUnchanged: true,
        originalHeadersPreserved: true,
        appendedOnly: true,
        sheetModified: false,
        secretValuesPrinted: false,
        rawRowsPrinted: false
      };
    }

    const backup = await createAndVerifyBackup(sheets, spreadsheetId, before, options.backupTitle || defaultBackupTitle(options.now));
    const sourceBeforeAppend = await readWorksheetSnapshot(sheets, spreadsheetId, EXPECTED_HISTORICAL_WORKSHEET_GID);
    if (!manifestsMatch(before, sourceBeforeAppend)) {
      throw new Error('Source worksheet changed between preflight and apply.');
    }

    await appendHeaderColumns(sheets, spreadsheetId, before.worksheetTitle, before.headers.length, plan.appendedColumns);
    const after = await readWorksheetSnapshot(sheets, spreadsheetId, EXPECTED_HISTORICAL_WORKSHEET_GID);
    const verification = verifyAppendOnly(before.rows, after.rows, plan.appendedColumns);
    if (!verification.existingCellsUnchanged || !verification.originalHeadersPreserved || !verification.appendedOnly) {
      throw new Error('Post-apply verification failed; migration was not strictly append-only.');
    }

    return {
      status: 'ok',
      mode,
      spreadsheetId,
      worksheetTitle: after.worksheetTitle,
      worksheetGid: after.worksheetGid,
      before: stripRows(before),
      after: stripRows(after),
      backup,
      plan,
      sourceManifestUnchanged: true,
      ...verification,
      sheetModified: true,
      secretValuesPrinted: false,
      rawRowsPrinted: false
    };
  } catch (error) {
    const classification = classifyGoogleMigrationError(error);
    return {
      status: 'blocked',
      mode,
      spreadsheetId,
      blockedReason: safeError(error),
      authFailureCategory: classification.authFailureCategory,
      httpStatus: classification.httpStatus,
      googleErrorReason: classification.googleErrorReason,
      googleErrorCode: classification.googleErrorCode,
      sheetModified: false,
      secretValuesPrinted: false,
      rawRowsPrinted: false
    };
  }
}

export function classifyGoogleMigrationError(error: unknown): {
  authFailureCategory: AuthFailureCategory;
  httpStatus?: number;
  googleErrorReason?: string;
  googleErrorCode?: string;
} {
  const record = toRecord(error);
  const response = toRecord(record.response);
  const data = toRecord(response.data);
  const firstError = Array.isArray(data.errors) ? toRecord(data.errors[0]) : {};
  const httpStatus = numeric(record.code) || numeric(response.status);
  const googleErrorReason = stringValue(firstError.reason) || stringValue(data.error) || stringValue(record.code);
  const googleErrorCode = stringValue(data.code) || stringValue(firstError.code) || stringValue(record.code);
  const message = [
    stringValue(record.message),
    stringValue(data.error),
    stringValue(data.error_description),
    stringValue(firstError.reason),
    stringValue(firstError.message)
  ].filter(Boolean).join(' ').toLowerCase();

  if (/eacces|enotfound|econnreset|etimedout|eai_again|network|socket/.test(message)) {
    return { authFailureCategory: 'network_failure', httpStatus, googleErrorReason, googleErrorCode };
  }
  if (/clock|timeframe|iat|exp|token used too early|invalid jwt.*time/.test(message)) {
    return { authFailureCategory: 'clock_skew', httpStatus, googleErrorReason, googleErrorCode };
  }
  if (/invalid_grant/.test(message) || googleErrorReason === 'invalid_grant') {
    return { authFailureCategory: 'invalid_grant', httpStatus, googleErrorReason, googleErrorCode };
  }
  if (/invalid.*signature|signature.*invalid/.test(message)) {
    return { authFailureCategory: 'invalid_signature', httpStatus, googleErrorReason, googleErrorCode };
  }
  if (/disabled|revoked|deleted|not found.*service account|key.*invalid/.test(message)) {
    return { authFailureCategory: 'key_revoked_or_disabled', httpStatus, googleErrorReason, googleErrorCode };
  }
  if (httpStatus === 403 || /forbidden|permission|insufficient|access denied/.test(message)) {
    return { authFailureCategory: 'permission_denied', httpStatus, googleErrorReason, googleErrorCode };
  }
  if (httpStatus === 404 || /not found|worksheet|sheet/.test(message)) {
    return { authFailureCategory: 'worksheet_access_denied', httpStatus, googleErrorReason, googleErrorCode };
  }
  return { authFailureCategory: 'unknown_authentication_failure', httpStatus, googleErrorReason, googleErrorCode };
}

async function readWorksheetSnapshot(sheets: SheetsLike, spreadsheetId: string, expectedGid: number): Promise<WorksheetSnapshot> {
  const metadata = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))'
  });
  const target = metadata.data.sheets?.find((sheet) => sheet.properties?.sheetId === expectedGid)?.properties;
  if (!target?.title) throw new Error('Expected worksheet was not found.');
  if (target.sheetId !== expectedGid) throw new Error('Configured worksheet does not match the requested worksheet GID.');

  const values = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: quoteSheetName(target.title),
    valueRenderOption: 'FORMATTED_VALUE',
    dateTimeRenderOption: 'FORMATTED_STRING'
  });
  const rows = (values.data.values || []).map((row) => row.map((value) => String(value || '')));
  const base = {
    worksheetTitle: target.title,
    worksheetGid: target.sheetId,
    valueRowCount: rows.length,
    valueColumnCount: Math.max(...rows.map((row) => row.length), 0),
    gridRowCount: target.gridProperties?.rowCount || 0,
    gridColumnCount: target.gridProperties?.columnCount || 0,
    headers: rows[0] || [],
    rows
  };
  return { ...base, verificationHash: buildWorksheetManifest(base).verificationHash };
}

async function createAndVerifyBackup(
  sheets: SheetsLike,
  spreadsheetId: string,
  before: WorksheetSnapshot,
  requestedTitle: string
): Promise<BackupResult> {
  const metadata = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))'
  });
  const existingTitles = new Set((metadata.data.sheets || []).map((sheet) => sheet.properties?.title).filter(Boolean) as string[]);
  const backupTitle = uniqueBackupTitle(requestedTitle, existingTitles);

  const response = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        duplicateSheet: {
          sourceSheetId: before.worksheetGid,
          newSheetName: backupTitle
        }
      }]
    }
  });
  const backupGid = response.data.replies?.[0]?.duplicateSheet?.properties?.sheetId;
  if (typeof backupGid !== 'number') throw new Error('Backup worksheet was not created.');

  const backup = await readWorksheetSnapshot(sheets, spreadsheetId, backupGid);
  if (!manifestsMatch(before, backup)) throw new Error('Backup worksheet verification failed.');
  return { title: backup.worksheetTitle, gid: backup.worksheetGid, verified: true, manifest: stripRows(backup) };
}

async function appendHeaderColumns(
  sheets: SheetsLike,
  spreadsheetId: string,
  worksheetTitle: string,
  existingHeaderCount: number,
  appendedColumns: readonly string[]
) {
  if (appendedColumns.length === 0) return;
  const start = columnName(existingHeaderCount + 1);
  const end = columnName(existingHeaderCount + appendedColumns.length);
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${quoteSheetName(worksheetTitle)}!${start}1:${end}1`,
    valueInputOption: 'RAW',
    requestBody: { values: [appendedColumns] }
  });
}

function createWriteCapableSheetsClient(env: NodeJS.ProcessEnv): SheetsLike {
  const credentials = parseServiceAccountJson(env.GOOGLE_SERVICE_ACCOUNT_JSON || '');
  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: [GOOGLE_SHEETS_SCHEMA_WRITE_SCOPE]
  });
  return google.sheets({ version: 'v4', auth }) as SheetsLike;
}

function parseServiceAccountJson(raw: string): ServiceAccountJson {
  try {
    const parsed = JSON.parse(raw) as ServiceAccountJson;
    if (!parsed.client_email || !parsed.private_key) throw new Error('missing required fields');
    return {
      ...parsed,
      private_key: parsed.private_key.replace(/\\n/g, '\n')
    };
  } catch {
    throw new Error('Malformed Google service-account configuration.');
  }
}

function normalizeHeader(header: string) {
  return header
    .trim()
    .toLowerCase()
    .replace(/[$%#]/g, ' ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function canonicalFieldForHeader(header: string) {
  const normalized = normalizeHeader(header);
  const compact = normalized.replace(/_/g, '');
  const exact: Record<string, string> = {
    job_id: 'job_id',
    opportunity_id: 'opportunity_id',
    estimate_id: 'estimate_id',
    date: 'estimate_date',
    estimate_date: 'estimate_date',
    completion_date: 'completion_date',
    completed_date: 'completion_date',
    original_quoted_price: 'original_quoted_price',
    customer_accepted_price: 'customer_accepted_price',
    opportunity_outcome: 'opportunity_outcome',
    loss_reason: 'loss_reason',
    cancellation_reason: 'cancellation_reason',
    job_type: 'service_type',
    service_type: 'service_type',
    amount: 'final_completed_price',
    price: 'final_completed_price',
    final_price: 'final_completed_price',
    final_completed_price: 'final_completed_price',
    city: 'city',
    direct_job_cost: 'direct_job_cost',
    project_costs: 'direct_job_cost',
    completed: 'completed',
    notes: 'notes',
    estimated_load_count: 'estimated_load_count',
    estimated_loads: 'estimated_load_count',
    actual_load_count: 'actual_load_count',
    actual_loads: 'actual_load_count',
    actual_load_percent: 'actual_load_percent',
    workers: 'workers',
    labor_hours: 'labor_hours',
    actual_hours: 'labor_hours',
    disposal_facility: 'disposal_facility',
    disposal_weight: 'disposal_weight',
    disposal_cost: 'disposal_cost',
    mileage: 'mileage',
    travel_time_minutes: 'travel_time_minutes',
    equipment_cost: 'equipment_cost',
    subcontractor_cost: 'subcontractor_cost',
    gross_margin_dollars: 'gross_margin_dollars',
    gross_margin_percent: 'gross_margin_percent',
    manager_override: 'manager_override',
    manager_override_reason: 'manager_override_reason',
    photo_reference_id: 'photo_reference_id',
    stairs: 'stairs',
    carry_distance: 'carry_distance',
    heavy_items: 'heavy_items',
    demo_required: 'demo_required',
    won_job: 'won_job'
  };
  if (exact[normalized]) return exact[normalized];
  if (compact.includes('jobtype') || compact.includes('service')) return 'service_type';
  if (compact.includes('completion') && compact.includes('date')) return 'completion_date';
  if (compact.includes('date')) return 'estimate_date';
  if (compact.includes('quote') && compact.includes('price')) return 'final_quoted_price';
  if (compact.includes('accepted') && compact.includes('price')) return 'accepted_price';
  if (compact.includes('price') || compact.includes('revenue')) return 'final_completed_price';
  if (compact.includes('actual') && compact.includes('load')) return 'actual_load_count';
  if (compact.includes('estimated') && compact.includes('load')) return 'estimated_load_count';
  if (compact.includes('labor') && compact.includes('hour')) return 'labor_hours';
  if (compact.includes('mile')) return 'mileage';
  if (compact.includes('travel')) return 'travel_time';
  if (compact.includes('disposal') && compact.includes('facility')) return 'disposal_facility';
  if (compact.includes('disposal') && compact.includes('weight')) return 'disposal_weight';
  if (compact.includes('disposal') && compact.includes('cost')) return 'disposal_cost';
  if (compact.includes('gross') && compact.includes('margin') && compact.includes('percent')) return 'gross_margin_percent';
  if (compact.includes('gross') && compact.includes('margin')) return 'gross_margin_dollars';
  if (compact.includes('manager') && compact.includes('override') && compact.includes('reason')) return 'manager_override_reason';
  if (compact.includes('override') && compact.includes('reason')) return 'override_reason';
  if (compact.includes('manager') && compact.includes('override')) return 'manager_override';
  if (compact.includes('loss') && compact.includes('reason')) return 'loss_reason';
  if (compact.includes('cancel') && compact.includes('reason')) return 'cancellation_reason';
  if (compact.includes('photo') || compact.includes('image')) return 'photo_reference';
  if (compact.includes('note')) return 'notes';
  return normalized || 'unnamed_column';
}

function findEquivalentMapping(column: HistoricalSchemaV2Column, mappings: HeaderMapping[]) {
  const equivalents = new Set([column, ...(SEMANTIC_EQUIVALENTS[column] || [])]);
  return mappings.find((mapping) => equivalents.has(mapping.normalizedHeader) || equivalents.has(mapping.canonicalField));
}

function stripRows(snapshot: WorksheetSnapshot): WorksheetManifest {
  const { rows: _rows, ...manifest } = snapshot;
  return manifest;
}

function normalizeRows(rows: string[][]) {
  const width = Math.max(...rows.map((row) => row.length), 0);
  return rows.map((row) => Array.from({ length: width }, (_, index) => cell(row, index)));
}

function cell(row: string[], index: number) {
  return String(row[index] || '');
}

function columnName(oneBasedIndex: number) {
  let output = '';
  let index = oneBasedIndex;
  while (index > 0) {
    index -= 1;
    output = String.fromCharCode(65 + (index % 26)) + output;
    index = Math.floor(index / 26);
  }
  return output;
}

function quoteSheetName(title: string) {
  return `'${title.replace(/'/g, "''")}'`;
}

function defaultBackupTitle(now = new Date()) {
  return `${SCHEMA_V2_BACKUP_TITLE_PREFIX} ${localDateString(now)} Pre Schema V2`;
}

function localDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function uniqueBackupTitle(preferred: string, existingTitles: Set<string>) {
  if (!existingTitles.has(preferred)) return preferred;
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return `${preferred} ${timestamp}`;
}

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/private|credential|token|client_email|key/i.test(message)) return 'Google Sheets migration failed before safe aggregate output could be produced.';
  return message;
}

function toRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}

function numeric(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
