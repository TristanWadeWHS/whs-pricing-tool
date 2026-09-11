import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { currentReferenceScope, matchHistoricalReference, resolveHistoricalReference, type ReferenceScope } from '../app/lib/historical-reference';
import { POST } from '../app/api/historical-reference/route';
vi.mock('../app/lib/historical-reference-source', () => ({ loadHistoricalReferences: vi.fn(() => { throw new Error('Unexpected live read'); }) }));

const scope: ReferenceScope = { scopeGroup: 'synthetic-verified-group', loadUnit: 'synthetic-shared-unit',
  projectedLoads: 1, stairs: false, heavyMaterials: false, demolition: false };
const records = [100, 200, 300, 400, 500].map((completedPrice) => ({ scope, completedPrice }));
afterEach(() => vi.unstubAllEnvs());

describe('historical references', () => {
  it('summarizes only exact shared scope with interpolated middle 50%', () => {
    const result = matchHistoricalReference(scope, [...records,
      { scope: { ...scope, projectedLoads: 10 }, completedPrice: 90000 },
      { scope: { ...scope, scopeGroup: 'unrelated' }, completedPrice: 80000 },
      { scope: { ...scope, demolition: true }, completedPrice: 70000 }]);
    expect(result).toMatchObject({ status: 'matched', matchedCount: 5, median: 300, p25: 200, p75: 400 });
  });
  it('never uses actual outcomes or price buckets for selection', () => {
    const augmented = records.map((row) => ({ ...row, actualWorkers: 99, actualLoads: 50, profit: -999,
      customer: 'synthetic-private-marker', notes: 'synthetic-private-marker' }));
    expect(matchHistoricalReference(scope, augmented)).toEqual(matchHistoricalReference(scope, records));
    expect(JSON.stringify(matchHistoricalReference(scope, augmented))).not.toContain('synthetic-private-marker');
  });
  it('preserves missing scope and refuses sparse or unit-incompatible comparisons', () => {
    for (const key of Object.keys(scope)) {
      expect(matchHistoricalReference({ ...scope, [key]: null }, records).status).toBe('abstained');
    }
    expect(matchHistoricalReference(scope, records.slice(0, 4)).median).toBeNull();
    expect(matchHistoricalReference({ ...scope, loadUnit: 'different' }, records).status).toBe('abstained');
    expect(matchHistoricalReference(scope, records.map((r) => ({ ...r, completedPrice: null }))).status).toBe('abstained');
  });
  it('does not retrieve data for the real app scope; no speculative crosswalk', async () => {
    const load = vi.fn();
    for (const stairs of ['none', 'some', 'heavy'] as const) {
      expect((await resolveHistoricalReference(currentReferenceScope(stairs), load)).status).toBe('abstained');
    }
    expect(load).not.toHaveBeenCalled();
  });
  it('isolates data failures and never exposes exception details', async () => {
    const result = await resolveHistoricalReference(scope, async () => { throw new Error('synthetic-secret-marker'); });
    expect(result.status).toBe('unavailable');
    expect(JSON.stringify(result)).not.toContain('synthetic-secret-marker');
  });
});

function request(body: string, authorized = true, query = '') {
  return new NextRequest(`http://localhost/api/historical-reference${query}`, { method: 'POST', body,
    headers: authorized ? { authorization: `Basic ${btoa('staff:test-only')}` } : {} });
}
describe('internal reference endpoint', () => {
  it('requires existing internal auth and rejects obsolete query-token access', async () => {
    vi.stubEnv('INTERNAL_ACCESS_TOKEN', 'test-only');
    const result = await POST(request('{}', false, '?access_token=test-only'));
    expect(result.status).toBe(401);
    expect(result.headers.get('www-authenticate')).toContain('Basic');
    expect(result.headers.get('cache-control')).toBe('no-store');
  });
  it('fails closed without auth configuration and outside Preview/development', async () => {
    vi.stubEnv('INTERNAL_ACCESS_TOKEN', '');
    expect((await POST(request('{}'))).status).toBe(503);
    vi.stubEnv('INTERNAL_ACCESS_TOKEN', 'test-only');
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('NODE_ENV', 'production');
    expect((await POST(request('{}'))).status).toBe(404);
  });
  it('returns private aggregate-only abstention for authorized Preview', async () => {
    vi.stubEnv('INTERNAL_ACCESS_TOKEN', 'test-only');
    vi.stubEnv('VERCEL_ENV', 'preview');
    const response = await POST(request('{"stairs":"none"}'));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const data = await response.json();
    expect(data.status).toBe('abstained');
    expect(Object.keys(data).sort()).toEqual(['matchedCount', 'median', 'p25', 'p75', 'reasons', 'status']);
  });
  it('rejects outcome inputs, fabricated crosswalks, invalid enums and oversized payloads', async () => {
    vi.stubEnv('INTERNAL_ACCESS_TOKEN', 'test-only');
    vi.stubEnv('VERCEL_ENV', 'preview');
    for (const body of [{ stairs: 'no' }, { stairs: 'none', price: 100 }, { stairs: 'none', scopeGroup: 'invented' }]) {
      expect((await POST(request(JSON.stringify(body)))).status).toBe(400);
    }
    expect((await POST(request('x'.repeat(257)))).status).toBe(413);
  });
});
