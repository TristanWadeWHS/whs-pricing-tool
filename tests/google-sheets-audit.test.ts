import { describe, expect, it } from 'vitest';
import { EXPECTED_HISTORICAL_SPREADSHEET_ID, getGoogleConfigPresence, parseServiceAccountJson, readHistoricalSheetSummary } from '../app/lib/google-sheets-audit';

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
});
