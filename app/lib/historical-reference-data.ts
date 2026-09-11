import { google } from 'googleapis';
import { EXPECTED_HISTORICAL_SPREADSHEET_ID, EXPECTED_HISTORICAL_WORKSHEET_GID,
  GOOGLE_SHEETS_READONLY_SCOPE, parseServiceAccountJson } from './google-sheets-audit';
import { adaptHistoricalRecord } from './shadow-historical-adapter';
import type { ReferenceRecord } from './historical-reference';

export const REFERENCE_SOURCE_LIMITS = { rows: 2000, columns: 52, timeoutMs: 8000, ttlMs: 300000, failureTtlMs: 30000 };

export function referenceRecordFromRow(row: Record<string, string>): ReferenceRecord {
  const { fields } = adaptHistoricalRecord(row);
  const number = (key: keyof typeof fields) => fields[key].status === 'valid' && typeof fields[key].value === 'number' ? fields[key].value as number : null;
  const binary = (key: keyof typeof fields) => fields[key].status === 'valid' && typeof fields[key].value === 'boolean' ? fields[key].value as boolean : null;
  return { completedPrice: number('final_completed_price'), scope: {
    stairs: binary('stairs'), heavyMaterials: binary('heavy_items'), demolition: binary('demo_required'),
    projectedLoads: number('projected_loads'), scopeGroup: null, loadUnit: null
  } };
}

// Internal output only. The API must return matcher aggregates, never these records.
export function sanitizeReferenceGrid(values: string[][]): ReferenceRecord[] {
  if (values.length > REFERENCE_SOURCE_LIMITS.rows + 1 || values.some((row) => row.length > REFERENCE_SOURCE_LIMITS.columns)) throw new Error('Historical source exceeds bounds.');
  const headers = values[0] ?? [];
  const populated = headers.map((name) => name.trim()).filter(Boolean);
  if (!populated.length || new Set(populated).size !== populated.length) throw new Error('Ambiguous historical headers.');
  return values.slice(1).filter((row) => row.some((value) => value.trim())).map((values) => {
    const row = Object.fromEntries(headers.flatMap((header, index) => header.trim() ? [[header.trim(), values[index] ?? '']] : []));
    try { return referenceRecordFromRow(row); }
    finally { for (const key of Object.keys(row)) delete row[key]; }
  });
}

export async function readReferenceRecords(env: Record<string, string | undefined> = process.env): Promise<ReferenceRecord[]> {
  if (env.GOOGLE_SPREADSHEET_ID !== EXPECTED_HISTORICAL_SPREADSHEET_ID || env.GOOGLE_SHEET_TAB !== 'ML Data') throw new Error('Historical source configuration unavailable.');
  const credentials = parseServiceAccountJson(env.GOOGLE_SERVICE_ACCOUNT_JSON ?? '');
  const auth = new google.auth.JWT({ email: credentials.client_email, key: credentials.private_key, scopes: [GOOGLE_SHEETS_READONLY_SCOPE] });
  let values: string[][] = [];
  try {
    const sheets = google.sheets({ version: 'v4', auth });
    const response = await sheets.spreadsheets.get({ spreadsheetId: EXPECTED_HISTORICAL_SPREADSHEET_ID,
      ranges: ["'ML Data'!A1:AZ2001"], includeGridData: true,
      fields: 'sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)),data(rowData(values(formattedValue))))'
    }, { timeout: REFERENCE_SOURCE_LIMITS.timeoutMs, retry: false });
    const sheet = response.data.sheets?.[0];
    if (response.data.sheets?.length !== 1 || sheet?.properties?.sheetId !== EXPECTED_HISTORICAL_WORKSHEET_GID || sheet.properties.title !== 'ML Data') throw new Error('Historical source identity mismatch.');
    // Reject oversized grids rather than silently summarizing a truncated subset.
    const grid = sheet.properties.gridProperties;
    if (!grid || !grid.rowCount || !grid.columnCount || grid.rowCount > REFERENCE_SOURCE_LIMITS.rows + 1 || grid.columnCount > REFERENCE_SOURCE_LIMITS.columns) throw new Error('Historical source exceeds bounds.');
    values = sheet.data?.[0]?.rowData?.map((row) => (row.values ?? []).map((cell) => cell.formattedValue ?? '')) ?? [];
    sheet.data = [];
    return sanitizeReferenceGrid(values);
  } catch { throw new Error('Historical source unavailable.'); }
  finally {
    values.forEach((row) => row.fill('')); values.length = 0;
    delete credentials.private_key; delete credentials.client_email;
    auth.key = undefined; auth.email = undefined; auth.setCredentials({});
  }
}

export function createPrivateReferenceCache(load: () => Promise<ReferenceRecord[]>, now = Date.now) {
  let cached: ReferenceRecord[] | null = null;
  let expires = 0;
  let failedUntil = 0;
  let pending: Promise<ReferenceRecord[]> | null = null;
  return async () => {
    if (cached && now() < expires) return cached;
    cached = null;
    if (now() < failedUntil) throw new Error('Historical source unavailable.');
    if (!pending) pending = Promise.resolve().then(load).then((records) => {
      if (records.length > REFERENCE_SOURCE_LIMITS.rows) throw new Error('Historical source exceeds bounds.');
      cached = records; expires = now() + REFERENCE_SOURCE_LIMITS.ttlMs; return records;
    }).catch(() => { failedUntil = now() + REFERENCE_SOURCE_LIMITS.failureTtlMs; throw new Error('Historical source unavailable.'); })
      .finally(() => { pending = null; });
    return pending;
  };
}
