import { describe, expect, it } from 'vitest';
import {
  EXPECTED_HISTORICAL_SPREADSHEET_ID,
  analyzeHistoricalRows,
  canonicalFieldForHeader,
  classifyPrivacyField,
  getGoogleConfigPresence,
  normalizeHeader,
  parseAuditDate,
  parseBooleanLike,
  parseCurrency,
  parsePercent,
  parseServiceAccountJson,
  readHistoricalSheetSummary
} from '../app/lib/google-sheets-audit';

describe('Google Sheets audit configuration', () => {
  it('reports missing configuration without exposing values', () => {
    expect(getGoogleConfigPresence({} as NodeJS.ProcessEnv)).toEqual({
      GOOGLE_SPREADSHEET_ID: 'missing',
      GOOGLE_SHEET_TAB: 'missing',
      GOOGLE_SERVICE_ACCOUNT_JSON: 'missing'
    });
  });

  it('normalizes escaped private-key newlines', () => {
    const parsed = parseServiceAccountJson(JSON.stringify({
      client_email: 'synthetic-service-account',
      private_key: 'line-one\\nline-two'
    }));
    expect(parsed.private_key).toContain('line-one\nline-two');
  });

  it('uses controlled errors for malformed credentials', () => {
    expect(() => parseServiceAccountJson('{')).toThrow('Malformed Google service-account configuration.');
    expect(() => parseServiceAccountJson(JSON.stringify({ private_key: 'x' }))).toThrow('Malformed Google service-account configuration.');
  });

  it('blocks spreadsheet mismatch before reading rows', async () => {
    const result = await readHistoricalSheetSummary({
      GOOGLE_SPREADSHEET_ID: 'not-the-expected-id',
      GOOGLE_SHEET_TAB: 'Completed Jobs',
      GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: 'synthetic-service-account', private_key: 'synthetic-key' })
    } as unknown as NodeJS.ProcessEnv);
    expect(result.config.GOOGLE_SPREADSHEET_ID).toBe('unexpected_spreadsheet');
    expect(result.blockedReason).toContain('does not match');
  });

  it('reports configured keys as present without revealing values', () => {
    const result = getGoogleConfigPresence({
      GOOGLE_SPREADSHEET_ID: EXPECTED_HISTORICAL_SPREADSHEET_ID,
      GOOGLE_SHEET_TAB: 'Completed Jobs',
      GOOGLE_SERVICE_ACCOUNT_JSON: 'redacted'
    } as unknown as NodeJS.ProcessEnv);
    expect(Object.values(result)).toEqual(['present', 'present', 'present']);
  });

  it('normalizes headers into stable canonical names', () => {
    expect(normalizeHeader(' Final Price ($) ')).toBe('final_price');
    expect(canonicalFieldForHeader('Customer Phone')).toBe('customer_phone');
    expect(canonicalFieldForHeader('Completed Date')).toBe('completion_date');
  });

  it('parses dates, currency, and percentages deterministically', () => {
    expect(parseAuditDate('2026-06-01')).toBe('2026-06-01');
    expect(parseAuditDate('not a date')).toBeNull();
    expect(parseCurrency('$1,250.50')).toBe(1250.5);
    expect(parseCurrency('(25)')).toBe(-25);
    expect(parseCurrency('n/a')).toBeNull();
    expect(parsePercent('85%')).toBe(0.85);
    expect(parseBooleanLike('Yes')).toBe(true);
    expect(parseAuditDate('No')).toBeNull();
  });

  it('treats completed-job price and yes/no operational flags as modelable audit fields', () => {
    expect(canonicalFieldForHeader('Price')).toBe('final_completed_price');
    const audit = analyzeHistoricalRows([
      ['Date', 'Price', 'Stairs', 'Won Job'],
      ['2026-06-01', '$250', 'No', 'Yes']
    ], {
      spreadsheetId: EXPECTED_HISTORICAL_SPREADSHEET_ID,
      tabName: 'ML Data',
      retrievalTimestamp: '2026-08-29T12:00:00.000Z'
    });
    expect(audit.schema?.find((column) => column.canonicalField === 'stairs')?.inferredType).toBe('boolean');
    expect(audit.outcomeAvailability?.finalCompletedPrice.available).toBe(true);
    expect(audit.outcomeAvailability?.quoteAccepted.available).toBe(true);
  });

  it('classifies private and sensitive fields without reading values', () => {
    expect(classifyPrivacyField('Customer Email')).toBe('direct_identifier');
    expect(classifyPrivacyField('Job Photos')).toBe('photo_reference');
    expect(classifyPrivacyField('Employee Notes')).toBe('sensitive_text');
    expect(classifyPrivacyField('Card Payment')).toBe('payment_sensitive');
  });

  it('audits a synthetic completed-job dataset without raw customer output requirements', () => {
    const audit = analyzeHistoricalRows([
      ['Opportunity ID', 'Customer Name', 'Estimate Date', 'Status', 'Service Type', 'City', 'Final Price', 'Actual Loads', 'Labor Hours', 'Disposal Cost', 'Employee Notes'],
      ['opp-001', 'Synthetic Person', '2026-05-01', 'Completed', 'Junk Removal', 'Mission Viejo', '$300', '1', '2.5', '$45', 'Synthetic note'],
      ['opp-002', 'Synthetic Other', '2026-06-01', 'Completed', 'junk removal', 'mission viejo', '350', '1', '3', '$55', 'Synthetic note'],
      ['opp-002', 'Synthetic Other', '2026-06-01', 'Completed', 'junk removal', 'mission viejo', '350', '1', '3', '$55', 'Synthetic note'],
      ['opp-003', 'Synthetic Lost', '2026-07-01', 'Lost', 'Light Demolition', 'Laguna Hills', '', '', '', '', 'Synthetic reason']
    ], {
      spreadsheetId: EXPECTED_HISTORICAL_SPREADSHEET_ID,
      tabName: 'Completed Jobs',
      worksheetGid: 969595299,
      retrievalTimestamp: '2026-08-29T12:00:00.000Z',
      codeCommit: 'synthetic'
    });

    expect(audit.source?.nonEmptyRows).toBe(4);
    expect(audit.source?.earliestDate).toBe('2026-05-01');
    expect(audit.source?.latestDate).toBe('2026-07-01');
    expect(audit.quality?.duplicateRows).toBe(1);
    expect(audit.quality?.nonCompletedRows).toBe(1);
    expect(audit.privacy?.excludeFromTraining).toContain('customer_name');
    expect(audit.outcomeAvailability?.finalCompletedPrice.available).toBe(true);
    expect(audit.targets?.some((target) => target.target === 'Final completed price')).toBe(true);
  });

  it('generates a deterministic redacted snapshot manifest', () => {
    const rows = [
      ['Opportunity ID', 'Customer Email', 'Estimate Date', 'Status', 'Final Price'],
      ['opp-001', 'one@example.test', '2026-05-01', 'Completed', '$300']
    ];
    const first = analyzeHistoricalRows(rows, {
      spreadsheetId: EXPECTED_HISTORICAL_SPREADSHEET_ID,
      tabName: 'Completed Jobs',
      retrievalTimestamp: '2026-08-29T12:00:00.000Z',
      codeCommit: 'synthetic'
    });
    const second = analyzeHistoricalRows(rows, {
      spreadsheetId: EXPECTED_HISTORICAL_SPREADSHEET_ID,
      tabName: 'Completed Jobs',
      retrievalTimestamp: '2026-08-29T12:00:00.000Z',
      codeCommit: 'synthetic'
    });
    expect(first.snapshotManifest?.datasetChecksum).toBe(second.snapshotManifest?.datasetChecksum);
    expect(first.snapshotManifest?.snapshotId).toBe(second.snapshotManifest?.snapshotId);
  });
});
