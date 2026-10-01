import { afterEach, describe, expect, it, vi } from 'vitest';
const fixtures = vi.hoisted(() => ({ routes: [] as unknown[], parse: vi.fn() }));
vi.mock('../data/locations/verified-routes.json', () => ({ default: { version: 'synthetic-routes', origin: 'Rancho Mission Viejo', records: fixtures.routes } }));
vi.mock('openai', () => ({ default: vi.fn(function () { return { responses: { parse: fixtures.parse } }; }) }));
import { GET } from '../app/api/estimate-location/route';
import { POST } from '../app/api/analyze/route';
import { assessRoute, resolveCity, searchCities, DIRECTORY_VERSION, ROUTE_VERSION, representativeRouteSchema } from '../app/lib/city-directory';
import { tierForDrivingMiles } from '../app/lib/location-resolution';
import { validateEstimateForm } from '../app/lib/request-validation';
import { makeForm, sampleAnalysis } from './helpers';
import cities from '../data/locations/cities.json';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import source from '../data/locations/source.json';

const lake = 'geonames:5364514';
// Invented test distances, NOT measured Lake Forest geography; never exported to source data.
const evidence = { sourceUrl: 'https://example.invalid/synthetic-route', verifiedOn: '2026-10-01', verifiedBy: 'synthetic-test-only' };
function route(miles = 20, min = 18, max = 22) {
  return { cityId: lake, origin: { city: 'Rancho Mission Viejo' as const, representativePoint: 'Synthetic origin' }, destinationPoint: 'Synthetic destination',
    representativeDrivingMiles: miles, evidence, cityDrivingRange: { min, max, evidence } };
}
function form(id = lake) {
  const f = makeForm(); f.delete('distanceTier'); f.set('workflow', 'guided-city-v3'); f.set('cityId', id);
  f.set('directoryVersion', DIRECTORY_VERSION); f.set('routeVersion', ROUTE_VERSION); return f;
}
afterEach(() => { fixtures.routes.length = 0; fixtures.parse.mockReset(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('versioned local city and route data', () => {
  it('pins a reproducible GeoNames subset with unique IDs and actual origin/search city coverage', () => {
    expect(createHash('sha256').update(readFileSync('data/locations/geonames-socal.tsv')).digest('hex')).toBe(source.subsetSha256);
    expect(cities.cities).toHaveLength(2562); expect(new Set(cities.cities.map((c) => c.id)).size).toBe(2562);
    expect(new Set(cities.cities.map((c) => c.county)).size).toBe(10);
    expect(searchCities('rancho mission viejo')[0].name).toBe('Rancho Mission Viejo');
    expect(searchCities('LAKE forest')[0]).toMatchObject({ id: lake, county: 'Orange County' });
    expect(searchCities('Lake Forest Orange')[0].id).toBe(lake);
    expect(searchCities('not-a-real-city-xyz')).toEqual([]); expect(searchCities('a')).toEqual([]);
  });
  it('disambiguates same-name cities by county and stable ID', () => {
    const matches = searchCities('Anza').filter((c) => c.name === 'Anza');
    expect(new Set(matches.map((c) => c.county))).toEqual(new Set(['Riverside County', 'Imperial County']));
    expect(new Set(matches.map((c) => c.id)).size).toBe(2);
    expect(searchCities('Anza Imperial')[0].county).toBe('Imperial County');
    const sameCounty = searchCities('San Ysidro San Diego').filter((c) => c.name === 'San Ysidro');
    expect(sameCounty).toHaveLength(2); expect(new Set(sameCounty.map((c) => c.label)).size).toBe(2);
  });
  it('returns selectable unmapped cities without credentials or external fetches', async () => {
    const external = vi.fn(() => { throw new Error('External access prohibited'); }); vi.stubGlobal('fetch', external);
    vi.stubEnv('GOOGLE_MAPS_API_KEY', ''); vi.stubEnv('WHS_MAPS_ORIGIN_PLACE_ID', '');
    const response = await GET(new Request('http://local/api/estimate-location?query=Lake%20Forest'));
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store');
    expect((await response.json()).suggestions[0].id).toBe(lake);
    const selected = await GET(new Request(`http://local/api/estimate-location?cityId=${lake}`));
    expect((await selected.json()).location).toMatchObject({ id: lake, status: 'staff_review_required', distanceTier: null, representativeDrivingMiles: null });
    expect(external).not.toHaveBeenCalled();
  });
  it('preserves exact thresholds, with unsupported distances never inferred', () => {
    expect([0, 25, 25.0001, 40, 40.0001, 65].map(tierForDrivingMiles)).toEqual(['under25', 'under25', '25to40', '25to40', '40to65', '40to65']);
    for (const n of [-1, NaN, Infinity, 65.001]) expect(tierForDrivingMiles(n)).toBeNull();
    expect(assessRoute(route())).toMatchObject({ status: 'verified', distanceTier: 'under25' });
    expect(assessRoute(route(30, 26, 35)).distanceTier).toBe('25to40');
    expect(assessRoute(route(50, 45, 60)).distanceTier).toBe('40to65');
  });
  it('requires review for boundary-crossing evidence, exact boundaries, absent variation and out-of-service routes', () => {
    for (const boundary of [25, 40, 65]) {
      for (const r of [route(boundary, boundary - 1, boundary + 1), route(boundary, boundary, boundary)]) {
        expect(assessRoute(r)).toMatchObject({ status: 'staff_review_required', distanceTier: null });
      }
    }
    expect(assessRoute({ ...route(), cityDrivingRange: null }).reason).toContain('variation');
    expect(assessRoute(route(66, 66, 70)).reason).toContain('65-mile');
    expect(assessRoute(null).representativeDrivingMiles).toBeNull();
    expect(assessRoute({ ...route(), evidence: null }).distanceTier).toBeNull();
    expect(representativeRouteSchema.safeParse(route(20, 21, 22)).success).toBe(false);
    fixtures.routes.push(route(), route()); expect(resolveCity(lake)?.distanceTier).toBeNull();
  });
  it('rejects free text, missing or duplicate IDs, spoofed tiers, stale snapshots and obsolete workflows', async () => {
    expect(resolveCity('Lake Forest')).toBeNull();
    expect((await GET(new Request('http://local/api/estimate-location?cityId=Lake%20Forest'))).status).toBe(400);
    for (const edit of [
      (f: FormData) => f.set('cityId', 'Lake Forest'), (f: FormData) => f.delete('cityId'),
      (f: FormData) => f.append('cityId', lake), (f: FormData) => f.set('distanceTier', 'under25'),
      (f: FormData) => f.set('directoryVersion', 'old'), (f: FormData) => f.set('routeVersion', 'old'),
      (f: FormData) => f.set('workflow', 'guided-location-v2')
    ]) { const f = form(); edit(f); const result = await validateEstimateForm(f); expect(result.ok).toBe(false); if (result.ok === false) expect(result.reviewLocation).toBeUndefined(); }
  });
  it('keeps canonical city and derived tier in the validated request, without trusting client labels', async () => {
    fixtures.routes.push(route()); const f = form(); f.set('cityLabel', 'Untrusted name');
    const valid = await validateEstimateForm(f); expect(valid.ok).toBe(true);
    if (valid.ok) expect(valid.value.inputs).toMatchObject({ distanceTier: 'under25', location: { id: lake, label: 'Lake Forest, Orange County, CA', distanceTier: 'under25' } });
    vi.stubEnv('OPENAI_API_KEY', 'synthetic'); fixtures.parse.mockResolvedValueOnce({ output_parsed: sampleAnalysis() });
    const response = await POST(new Request('http://local/api/analyze', { method: 'POST', body: f }) as never);
    expect(response.status).toBe(200); expect((await response.json()).inputs.location.id).toBe(lake);
  });
  it('handles an unknown tier gracefully with no price, customer quote, historical leakage or model call', async () => {
    const external = vi.fn(() => { throw new Error('No external calls'); }); vi.stubGlobal('fetch', external);
    const response = await POST(new Request('http://local/api/analyze', { method: 'POST', body: form() }) as never);
    const body = await response.json();
    expect(response.status).toBe(200); expect(body).toMatchObject({ status: 'needs_manager_review', pricing: null, analysis: null, priceWithheld: true, firmQuoteEligible: false, inputs: { location: { id: lake }, distanceTier: null } });
    expect(body.statusReasons.join(' ')).toContain('confirm the tier'); expect(body.clarification).toBeUndefined();
    expect(fixtures.parse).not.toHaveBeenCalled(); expect(external).not.toHaveBeenCalled();
  });
  it('still validates photos and scope before returning a location review state', async () => {
    const f = form(); f.delete('photos'); const result = await validateEstimateForm(f);
    expect(result).toMatchObject({ ok: false, error: 'Upload at least one photo.' });
    if (result.ok === false) expect(result.reviewLocation).toBeUndefined();
  });
});
