import { describe, expect, it, vi } from 'vitest';
import { google } from 'googleapis';
import { createPrivateReferenceCache, readReferenceRecords, referenceRecordFromRow, sanitizeReferenceGrid } from '../app/lib/historical-reference-data';
import { currentReferenceScope } from '../app/lib/historical-reference';

describe('historical source mapping and privacy', () => {
  it('keeps only supported scope values and completed price, without inferring units', () => {
    const record = referenceRecordFromRow({ Amount: '600', 'Estimated Loads': '1', Stairs: 'No', 'Heavy Items': 'yes', Demolition: '0',
      Workers: '9', 'Actual Loads': '8', 'Net Profit': '400', Date: '9/1/2026', Notes: 'synthetic-private', Name: 'synthetic-private', 'Carry Distance': '4' });
    expect(record).toEqual({ completedPrice: 600, scope: { projectedLoads: 1, stairs: false, heavyMaterials: true, demolition: false, scopeGroup: null, loadUnit: null } });
    expect(JSON.stringify(record)).not.toContain('synthetic-private');
    expect(currentReferenceScope('none', 1)).toMatchObject({ stairs: false, projectedLoads: 1, loadUnit: null, heavyMaterials: null, demolition: null });
  });
  it('preserves missing, invalid and conflicting fields without legacy fallback', () => {
    const record = referenceRecordFromRow({ Amount: '100', final_completed_price: '', 'Estimated Loads': '1', 'Projected Loads': '2', Stairs: '2', Demolition: '', 'Heavy Items': 'unknown' });
    expect(record.completedPrice).toBeNull();
    expect(Object.values(record.scope).every((value) => value === null)).toBe(true);
    expect(currentReferenceScope(undefined, undefined).stairs).toBeNull();
  });
  it('rejects duplicate headers and excessive rows rather than losing or truncating data', () => {
    expect(() => sanitizeReferenceGrid([['Amount', 'Amount'], ['100', '200']])).toThrow();
    expect(() => sanitizeReferenceGrid(Array.from({ length: 2002 }, () => ['100']))).toThrow();
    expect(sanitizeReferenceGrid([['Amount', 'Stairs'], ['100', ''], ['', ''], ['200', '1']])).toHaveLength(2);
  });
  it('uses one bounded read-only get, verifies GID and does not return raw fields', async () => {
    const get = vi.fn().mockResolvedValue({ data: { sheets: [{ properties: { sheetId: 969595299, title: 'ML Data', gridProperties: { rowCount: 1000, columnCount: 51 } },
      data: [{ rowData: [['Amount', 'Stairs', 'Notes'], ['100', 'No', 'synthetic-private']].map((row) => ({ values: row.map((formattedValue) => ({ formattedValue })) })) }] }] } });
    const spy = vi.spyOn(google, 'sheets').mockReturnValue({ spreadsheets: { get } } as never);
    const env = { GOOGLE_SPREADSHEET_ID: '1VKZgdAwWURAkACKSUrEGSoNib1xQaQ7zzpBGfwneOeI', GOOGLE_SHEET_TAB: 'ML Data',
      GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: 'synthetic@example.invalid', private_key: 'synthetic-only' }) };
    try {
      const result = await readReferenceRecords(env);
      expect(result).toHaveLength(1);
      expect(JSON.stringify(result)).not.toContain('synthetic-private');
      expect(get).toHaveBeenCalledOnce();
      expect(get.mock.calls[0][0].ranges).toEqual(["'ML Data'!A1:AZ2001"]);
      expect(get.mock.calls[0][1]).toEqual({ timeout: 8000, retry: false });
      const auth = spy.mock.calls[0][0].auth as { scopes: string[]; key?: string };
      expect(auth.scopes).toEqual(['https://www.googleapis.com/auth/spreadsheets.readonly']);
      expect(auth.key).toBeUndefined();
      get.mockResolvedValue({ data: { sheets: [{ properties: { sheetId: 123, title: 'ML Data' } }] } });
      await expect(readReferenceRecords(env)).rejects.toThrow('Historical source unavailable.');
      get.mockRejectedValue(new Error('synthetic-private failure details'));
      await expect(readReferenceRecords(env)).rejects.toThrow(/^Historical source unavailable\.$/);
    } finally { spy.mockRestore(); }
  });
});

describe('private reference cache', () => {
  it('coalesces reads, expires without stale fallback, and caches failures briefly', async () => {
    let time = 0;
    const load = vi.fn().mockResolvedValue([]);
    const cache = createPrivateReferenceCache(load, () => time);
    await Promise.all([cache(), cache(), cache()]);
    expect(load).toHaveBeenCalledTimes(1);
    time = 299999; await cache(); expect(load).toHaveBeenCalledTimes(1);
    time = 300000; load.mockRejectedValue(new Error('private'));
    await expect(cache()).rejects.toThrow(/^Historical source unavailable\.$/);
    await expect(cache()).rejects.toThrow(); expect(load).toHaveBeenCalledTimes(2);
    time = 330000; load.mockResolvedValue([]); await cache(); expect(load).toHaveBeenCalledTimes(3);
  });
  it('rejects oversized data and synchronous failures without disclosing exception details', async () => {
    const cache = createPrivateReferenceCache(async () => Array(2001).fill({}));
    await expect(cache()).rejects.toThrow(/^Historical source unavailable\.$/);
    const sync = createPrivateReferenceCache(() => { throw new Error('private'); });
    await expect(sync()).rejects.toThrow(/^Historical source unavailable\.$/);
  });
});
