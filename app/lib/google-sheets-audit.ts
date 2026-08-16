import { google } from 'googleapis';

export const EXPECTED_HISTORICAL_SPREADSHEET_ID = '1VKZgdAwWURAkACKSUrEGSoNib1xQaQ7zzpBGfwneOeI';
export const EXPECTED_HISTORICAL_WORKSHEET_GID = 969595299;
export const GOOGLE_SHEETS_READONLY_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';

export type GoogleConfigStatus =
  | 'present'
  | 'missing'
  | 'malformed'
  | 'unexpected_spreadsheet'
  | 'authentication_failed'
  | 'worksheet_missing'
  | 'worksheet_mismatch';

export type HistoricalSheetAuditSummary = {
  config: Record<'GOOGLE_SPREADSHEET_ID' | 'GOOGLE_SHEET_TAB' | 'GOOGLE_SERVICE_ACCOUNT_JSON', GoogleConfigStatus>;
  worksheetName?: string;
  worksheetGid?: number;
  totalRows?: number;
  nonEmptyRecords?: number;
  headers?: string[];
  blockedReason?: string;
};

type ServiceAccountJson = {
  client_email?: string;
  private_key?: string;
  [key: string]: unknown;
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

export async function readHistoricalSheetSummary(env = process.env): Promise<HistoricalSheetAuditSummary> {
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

  let credentials: ServiceAccountJson;
  try {
    credentials = parseServiceAccountJson(env.GOOGLE_SERVICE_ACCOUNT_JSON || '');
  } catch {
    return {
      config: { ...config, GOOGLE_SERVICE_ACCOUNT_JSON: 'malformed' },
      blockedReason: 'Google service-account configuration is malformed.'
    };
  }

  try {
    const auth = new google.auth.JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: [GOOGLE_SHEETS_READONLY_SCOPE]
    });
    const sheets = google.sheets({ version: 'v4', auth });

    const metadata = await sheets.spreadsheets.get({
      spreadsheetId: env.GOOGLE_SPREADSHEET_ID,
      fields: 'sheets(properties(sheetId,title))'
    });
    const expectedSheet = metadata.data.sheets?.find((sheet) => sheet.properties?.sheetId === EXPECTED_HISTORICAL_WORKSHEET_GID);
    const configuredSheet = metadata.data.sheets?.find((sheet) => sheet.properties?.title === env.GOOGLE_SHEET_TAB);

    if (!configuredSheet) {
      return { config: { ...config, GOOGLE_SHEET_TAB: 'worksheet_missing' }, blockedReason: 'Configured worksheet was not found.' };
    }

    if (!expectedSheet || expectedSheet.properties?.title !== configuredSheet.properties?.title) {
      return { config: { ...config, GOOGLE_SHEET_TAB: 'worksheet_mismatch' }, blockedReason: 'Configured worksheet does not match the expected worksheet GID.' };
    }

    const values = await sheets.spreadsheets.values.get({
      spreadsheetId: env.GOOGLE_SPREADSHEET_ID,
      range: `'${env.GOOGLE_SHEET_TAB}'`
    });
    const rows = values.data.values || [];
    const headers = rows[0] || [];
    const records = rows.slice(1).filter((row) => row.some((cell) => String(cell || '').trim().length > 0));

    return {
      config,
      worksheetName: configuredSheet.properties?.title || env.GOOGLE_SHEET_TAB,
      worksheetGid: configuredSheet.properties?.sheetId || undefined,
      totalRows: rows.length,
      nonEmptyRecords: records.length,
      headers: headers.map(String)
    };
  } catch {
    return {
      config: { ...config, GOOGLE_SERVICE_ACCOUNT_JSON: 'authentication_failed' },
      blockedReason: 'Read-only Google Sheets access failed.'
    };
  }
}

