import { describe, expect, it } from 'vitest';
import {
  EXPECTED_HISTORICAL_SPREADSHEET_ID,
  EXPECTED_HISTORICAL_WORKSHEET_GID
} from '../app/lib/google-sheets-audit';
import {
  GOOGLE_SHEETS_SCHEMA_WRITE_SCOPE,
  buildSchemaV2Plan,
  buildWorksheetManifest,
  classifyGoogleMigrationError,
  manifestsMatch,
  runHistoricalSchemaV2Migration,
  verifyAppendOnly,
  type SheetsLike
} from '../app/lib/google-sheets-schema-v2';

const baseRows = [
  ['Date', 'Job Type', 'Price', 'City', 'Direct Job Cost', 'Completed', 'Notes', 'Actual Load Count', 'Labor Hours', 'Won Job'],
  ['2026-06-01', 'Junk Removal', '$400', 'Mission Viejo', '$120', 'Yes', 'Synthetic internal note', '1', '2', 'Yes']
];

describe('historical schema-v2 migration planning', () => {
  it('keeps write scope isolated from the read-only audit module', () => {
    expect(GOOGLE_SHEETS_SCHEMA_WRITE_SCOPE).toBe('https://www.googleapis.com/auth/spreadsheets');
  });

  it('detects semantic existing-field mappings and appends only missing columns', () => {
    const plan = buildSchemaV2Plan(baseRows[0]);
    expect(plan.mappings.find((mapping) => mapping.header === 'Price')?.canonicalField).toBe('final_completed_price');
    expect(plan.skippedColumns).toContainEqual({
      column: 'employee_correction_notes',
      equivalentHeader: 'Notes',
      canonicalField: 'notes'
    });
    expect(plan.appendedColumns).toContain('job_id');
    expect(plan.appendedColumns).toContain('completion_date');
    expect(plan.appendedColumns).toContain('photo_reference_id');
    expect(plan.appendedColumns).not.toContain('employee_correction_notes');
  });

  it('refuses duplicate normalized headers', () => {
    expect(() => buildSchemaV2Plan(['Job ID', 'job_id'])).toThrow('Duplicate or ambiguous normalized header');
  });

  it('verifies append-only changes without accepting row edits', () => {
    const appended = ['job_id', 'model_version'];
    const ok = verifyAppendOnly(baseRows, [
      [...baseRows[0], ...appended],
      [...baseRows[1], '', '']
    ], appended);
    expect(ok).toEqual({
      existingCellsUnchanged: true,
      originalHeadersPreserved: true,
      appendedOnly: true
    });

    const edited = verifyAppendOnly(baseRows, [
      [...baseRows[0], ...appended],
      ['changed', ...baseRows[1].slice(1), '', '']
    ], appended);
    expect(edited.existingCellsUnchanged).toBe(false);
  });

  it('builds deterministic non-reversible manifests', () => {
    const base = snapshotBase(baseRows);
    expect(buildWorksheetManifest(base).verificationHash).toBe(buildWorksheetManifest(base).verificationHash);
    expect(manifestsMatch(buildWorksheetManifest(base), buildWorksheetManifest(base))).toBe(true);
  });
});

describe('historical schema-v2 migration runner', () => {
  it('dry-runs by default and does not write', async () => {
    const sheets = new FakeSheets(baseRows);
    const result = await runHistoricalSchemaV2Migration({
      env: env(),
      sheets
    });
    expect(result.status).toBe('ok');
    expect(result.mode).toBe('dry-run');
    expect(result.sheetModified).toBe(false);
    expect(sheets.batchUpdates).toBe(0);
    expect(sheets.valueUpdates).toBe(0);
    expect(result.plan?.appendedColumns.length).toBeGreaterThan(0);
  });

  it('requires the explicit apply guard', async () => {
    const result = await runHistoricalSchemaV2Migration({
      env: env({ ALLOW_GOOGLE_SHEET_SCHEMA_WRITE: undefined }),
      sheets: new FakeSheets(baseRows),
      mode: 'apply'
    });
    expect(result.status).toBe('blocked');
    expect(result.blockedReason).toContain('ALLOW_GOOGLE_SHEET_SCHEMA_WRITE=true');
  });

  it('fails closed on spreadsheet mismatch', async () => {
    const result = await runHistoricalSchemaV2Migration({
      env: env({ GOOGLE_SPREADSHEET_ID: 'wrong-sheet', ALLOW_GOOGLE_SHEET_SCHEMA_WRITE: 'true' }),
      sheets: new FakeSheets(baseRows),
      mode: 'apply'
    });
    expect(result.status).toBe('blocked');
    expect(result.sheetModified).toBe(false);
  });

  it('fails closed on GID mismatch', async () => {
    const result = await runHistoricalSchemaV2Migration({
      env: env({ ALLOW_GOOGLE_SHEET_SCHEMA_WRITE: 'true' }),
      sheets: new FakeSheets(baseRows, { gid: 123 }),
      mode: 'apply'
    });
    expect(result.status).toBe('blocked');
    expect(result.blockedReason).toContain('Expected worksheet was not found');
  });

  it('creates and verifies a backup before append-only apply', async () => {
    const sheets = new FakeSheets(baseRows);
    const result = await runHistoricalSchemaV2Migration({
      env: env({ ALLOW_GOOGLE_SHEET_SCHEMA_WRITE: 'true' }),
      sheets,
      mode: 'apply',
      now: new Date('2026-09-01T12:00:00.000Z')
    });
    expect(result.status).toBe('ok');
    expect(result.backup?.title).toBe('ML Data Backup 2026-09-01 Pre Schema V2');
    expect(result.backup?.verified).toBe(true);
    expect(result.existingCellsUnchanged).toBe(true);
    expect(result.originalHeadersPreserved).toBe(true);
    expect(result.appendedOnly).toBe(true);
    expect(sheets.batchUpdates).toBe(1);
    expect(sheets.valueUpdates).toBe(1);
  });

  it('is idempotent after columns exist', async () => {
    const sheets = new FakeSheets(baseRows);
    await runHistoricalSchemaV2Migration({
      env: env({ ALLOW_GOOGLE_SHEET_SCHEMA_WRITE: 'true' }),
      sheets,
      mode: 'apply',
      now: new Date('2026-09-01T12:00:00.000Z')
    });
    const second = await runHistoricalSchemaV2Migration({ env: env(), sheets });
    expect(second.status).toBe('ok');
    expect(second.mode).toBe('dry-run');
    expect(second.plan?.appendedColumns).toEqual([]);
  });

  it('blocks when backup verification fails', async () => {
    const result = await runHistoricalSchemaV2Migration({
      env: env({ ALLOW_GOOGLE_SHEET_SCHEMA_WRITE: 'true' }),
      sheets: new FakeSheets(baseRows, { corruptBackup: true }),
      mode: 'apply'
    });
    expect(result.status).toBe('blocked');
    expect(result.blockedReason).toContain('Backup worksheet verification failed');
  });

  it('blocks when source changes between backup and append', async () => {
    const result = await runHistoricalSchemaV2Migration({
      env: env({ ALLOW_GOOGLE_SHEET_SCHEMA_WRITE: 'true' }),
      sheets: new FakeSheets(baseRows, { mutateSourceAfterBackup: true }),
      mode: 'apply'
    });
    expect(result.status).toBe('blocked');
    expect(result.blockedReason).toContain('Source worksheet changed');
  });

  it('returns aggregate redacted output without raw rows', async () => {
    const result = await runHistoricalSchemaV2Migration({
      env: env(),
      sheets: new FakeSheets(baseRows)
    });
    const serialized = JSON.stringify(result);
    expect(result.rawRowsPrinted).toBe(false);
    expect(result.secretValuesPrinted).toBe(false);
    expect(serialized).not.toContain('Synthetic internal note');
    expect(serialized).not.toContain('fake-private-key');
  });

  it('classifies Google failures without returning raw error bodies', () => {
    const denied = classifyGoogleMigrationError({
      code: 403,
      response: { status: 403, data: { errors: [{ reason: 'forbidden' }] } },
      message: 'caller does not have permission'
    });
    expect(denied).toMatchObject({ authFailureCategory: 'permission_denied', httpStatus: 403, googleErrorReason: 'forbidden' });

    const invalidGrant = classifyGoogleMigrationError({
      response: { status: 400, data: { error: 'invalid_grant' } },
      message: 'invalid_grant'
    });
    expect(invalidGrant.authFailureCategory).toBe('invalid_grant');

    const network = classifyGoogleMigrationError({ code: 'ENOTFOUND', message: 'network ENOTFOUND' });
    expect(network.authFailureCategory).toBe('network_failure');

    const sandboxSocket = classifyGoogleMigrationError({ code: 'EACCES', message: 'connect EACCES' });
    expect(sandboxSocket.authFailureCategory).toBe('network_failure');
  });
});

function env(overrides: Record<string, string | undefined> = {}) {
  return {
    GOOGLE_SPREADSHEET_ID: EXPECTED_HISTORICAL_SPREADSHEET_ID,
    GOOGLE_SHEET_TAB: 'ML Data',
    GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: 'synthetic', private_key: 'fake-private-key' }),
    ...overrides
  } as unknown as NodeJS.ProcessEnv;
}

function snapshotBase(rows: string[][]) {
  return {
    worksheetTitle: 'ML Data',
    worksheetGid: EXPECTED_HISTORICAL_WORKSHEET_GID,
    valueRowCount: rows.length,
    valueColumnCount: Math.max(...rows.map((row) => row.length), 0),
    gridRowCount: 1000,
    gridColumnCount: 26,
    headers: rows[0],
    rows
  };
}

class FakeSheets implements SheetsLike {
  batchUpdates = 0;
  valueUpdates = 0;

  private nextGid = 222;
  private readonly sheets = new Map<number, { title: string; rows: string[][]; gridRows: number; gridColumns: number }>();

  constructor(rows: string[][], private readonly options: {
    gid?: number;
    corruptBackup?: boolean;
    mutateSourceAfterBackup?: boolean;
  } = {}) {
    this.sheets.set(options.gid ?? EXPECTED_HISTORICAL_WORKSHEET_GID, {
      title: 'ML Data',
      rows: rows.map((row) => [...row]),
      gridRows: 1000,
      gridColumns: 26
    });
  }

  spreadsheets = {
    get: async () => ({
      data: {
        sheets: Array.from(this.sheets.entries()).map(([sheetId, sheet]) => ({
          properties: {
            sheetId,
            title: sheet.title,
            gridProperties: {
              rowCount: sheet.gridRows,
              columnCount: sheet.gridColumns
            }
          }
        }))
      }
    }),
    batchUpdate: async (args: unknown) => {
      this.batchUpdates += 1;
      const request = (args as { requestBody: { requests: Array<{ duplicateSheet: { sourceSheetId: number; newSheetName: string } }> } })
        .requestBody.requests[0].duplicateSheet;
      const source = this.sheets.get(request.sourceSheetId);
      if (!source) return { data: { replies: [] } };
      const gid = this.nextGid++;
      const backupRows = source.rows.map((row) => [...row]);
      if (this.options.corruptBackup) backupRows[1][0] = 'changed';
      this.sheets.set(gid, {
        title: request.newSheetName,
        rows: backupRows,
        gridRows: source.gridRows,
        gridColumns: source.gridColumns
      });
      if (this.options.mutateSourceAfterBackup) source.rows[1][0] = 'changed';
      return { data: { replies: [{ duplicateSheet: { properties: { sheetId: gid, title: request.newSheetName } } }] } };
    },
    values: {
      get: async (args: unknown) => {
        const range = (args as { range: string }).range;
        const title = range.match(/^'((?:''|[^'])+)'/)?.[1]?.replace(/''/g, "'");
        const sheet = Array.from(this.sheets.values()).find((candidate) => candidate.title === title);
        return { data: { values: sheet?.rows.map((row) => [...row]) || [] } };
      },
      update: async (args: unknown) => {
        this.valueUpdates += 1;
        const { range, requestBody } = args as { range: string; requestBody: { values: string[][] } };
        const title = range.match(/^'((?:''|[^'])+)'/)?.[1]?.replace(/''/g, "'");
        const startColumn = range.match(/!([A-Z]+)1:/)?.[1] || 'A';
        const sheet = Array.from(this.sheets.values()).find((candidate) => candidate.title === title);
        if (!sheet) return { data: {} };
        const startIndex = columnIndex(startColumn);
        const values = requestBody.values[0];
        sheet.rows[0] = [...sheet.rows[0]];
        values.forEach((value, offset) => {
          sheet.rows[0][startIndex + offset] = value;
        });
        return { data: {} };
      }
    }
  };
}

function columnIndex(column: string) {
  return column.split('').reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0) - 1;
}
