import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const parseMock = vi.hoisted(() => vi.fn());
vi.mock('openai', () => ({ default: vi.fn(function () { return { responses: { parse: parseMock } }; }) }));
import { GET } from '../app/api/estimate-location/route';
import { POST } from '../app/api/analyze/route';
import { resolveLocation, verifyLocationToken } from '../app/lib/location-provider';
import { tierForDrivingMiles } from '../app/lib/location-resolution';
import { validateEstimateForm } from '../app/lib/request-validation';
import { makeForm, sampleAnalysis } from './helpers';

const fetchMock = vi.fn();
const session = 'synthetic-session-123';
const place = (id = 'lake-forest', name = 'Lake Forest', state = 'CA', types = ['locality']) => ({ id, displayName: { text: name }, types,
  addressComponents: [{ shortText: state, types: ['administrative_area_level_1'] }, { shortText: 'US', types: ['country'] }],
  location: { latitude: 33.65, longitude: -117.69 } });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
function routeMocks(miles = 25) {
  fetchMock.mockResolvedValueOnce(json(place())).mockResolvedValueOnce(json(place('rmv-origin', 'Rancho Mission Viejo')))
    .mockResolvedValueOnce(json({ routes: [{ distanceMeters: miles * 1609.344 }] }));
}
beforeEach(() => {
  vi.stubEnv('GOOGLE_MAPS_API_KEY', 'synthetic-maps-key'); vi.stubEnv('WHS_MAPS_ORIGIN_PLACE_ID', 'rmv-origin');
  vi.stubEnv('OPENAI_API_KEY', 'synthetic-openai-key'); vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); fetchMock.mockReset(); parseMock.mockReset(); });
describe('protected location provider adapter', () => {
  it('returns stable California area suggestions without routing each prediction', async () => {
    fetchMock.mockResolvedValueOnce(json({ suggestions: [
      { placePrediction: { placeId: 'lake-forest', text: { text: 'Lake Forest, CA, USA' } } },
      { placePrediction: { placeId: 'other', text: { text: 'Lake Forest, IL, USA' } } }
    ] }));
    const response = await GET(new Request(`http://local/api/estimate-location?query=Lake%20Forest&session=${session}`));
    expect(await response.json()).toEqual({ suggestions: [{ id: 'lake-forest', label: 'Lake Forest, CA, USA' }] });
    expect(response.headers.get('cache-control')).toBe('no-store'); expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://places.googleapis.com/v1/places:autocomplete');
    expect(JSON.parse(options.body)).toMatchObject({ includedRegionCodes: ['us'], includedPrimaryTypes: ['locality', 'neighborhood', 'sublocality', 'sublocality_level_1'], sessionToken: session });
    expect(options.headers['X-Goog-Api-Key']).toBe('synthetic-maps-key'); expect(options.cache).toBe('no-store');
  });
  it('resolves Lake Forest with coordinates, actual route miles and a signed tier reused for clarification', async () => {
    routeMocks(25.01);
    const response = await GET(new Request(`http://local/api/estimate-location?placeId=lake-forest&session=${session}`));
    expect(response.status).toBe(200);
    const { location } = await response.json();
    expect(location).toMatchObject({ id: 'lake-forest', label: 'Lake Forest, CA', latitude: 33.65, longitude: -117.69, drivingMiles: 25.01 });
    expect(JSON.stringify(location)).not.toContain('synthetic-maps-key');
    expect(verifyLocationToken(location.token)).toEqual(location);
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toMatchObject({ origin: { placeId: 'rmv-origin' }, destination: { placeId: 'lake-forest' }, travelMode: 'DRIVE' });
    const form = makeForm({ distanceTier: '25to40' }); form.set('workflow', 'guided-location-v2'); form.set('locationToken', location.token);
    expect((await validateEstimateForm(form, verifyLocationToken(location.token))).ok).toBe(true);
    parseMock.mockResolvedValue({ output_parsed: sampleAnalysis() });
    const result = await POST(new Request('http://local/api/analyze', { method: 'POST', body: form }) as never);
    expect(result.status).toBe(200); expect((await result.json()).inputs.distanceTier).toBe('25to40');
    expect(fetchMock).toHaveBeenCalledTimes(3); // No paid re-routing on analysis.
    form.set('distanceTier', 'under25');
    expect((await validateEstimateForm(form, verifyLocationToken(location.token))).ok).toBe(false);
  });
  it('keeps boundaries exact, with no rounding into a cheaper tier', () => {
    expect([0, 25, 25.00001, 40, 40.00001, 65].map(tierForDrivingMiles)).toEqual(['under25', 'under25', '25to40', '25to40', '40to65', '40to65']);
    for (const value of [-1, 65.00001, NaN, Infinity]) expect(tierForDrivingMiles(value)).toBeNull();
  });
  it('rejects forged, expired and wrong-origin proofs without calling Maps', async () => {
    routeMocks(); const location = await resolveLocation('lake-forest', session);
    const [payload, signature] = location.token.split('.');
    const edited = JSON.parse(Buffer.from(payload, 'base64url').toString()); edited.location.drivingMiles = 1;
    expect(() => verifyLocationToken(`${Buffer.from(JSON.stringify(edited)).toString('base64url')}.${signature}`)).toThrow('invalid or expired');
    expect(() => verifyLocationToken('Lake Forest')).toThrow();
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 61 * 60_000);
    expect(() => verifyLocationToken(location.token)).toThrow(); vi.restoreAllMocks();
    vi.stubEnv('WHS_MAPS_ORIGIN_PLACE_ID', 'changed-origin'); expect(() => verifyLocationToken(location.token)).toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
  it('rejects free text, malformed requests and missing config before external calls', async () => {
    expect((await GET(new Request('http://local/api/estimate-location?query=a'))).status).toBe(400);
    expect((await GET(new Request(`http://local/api/estimate-location?placeId=Lake%20Forest&session=${session}`))).status).toBe(400);
    vi.stubEnv('GOOGLE_MAPS_API_KEY', '');
    const response = await GET(new Request(`http://local/api/estimate-location?query=Lake&session=${session}`));
    expect(response.status).toBe(503); expect((await response.json()).error).toContain('GOOGLE_MAPS_API_KEY');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('handles empty results and sanitizes provider errors/timeouts', async () => {
    fetchMock.mockResolvedValueOnce(json({ suggestions: [] }));
    const req = new Request(`http://local/api/estimate-location?query=Nowhere&session=${session}`);
    expect((await (await GET(req)).json()).suggestions).toEqual([]);
    fetchMock.mockResolvedValueOnce(json({ error: 'private provider data' }, 403));
    const failure = await GET(req); expect(failure.status).toBe(502); expect(JSON.stringify(await failure.json())).not.toContain('private provider data');
    fetchMock.mockRejectedValueOnce(new Error('private timeout'));
    const timeout = await GET(req); expect(timeout.status).toBe(502); expect(JSON.stringify(await timeout.json())).not.toContain('private timeout');
  });
  it('rejects outside CA, businesses, wrong origins, unavailable routes and beyond-service destinations', async () => {
    fetchMock.mockResolvedValueOnce(json(place('lake-forest', 'Lake Forest', 'IL')));
    await expect(resolveLocation('lake-forest', session)).rejects.toThrow('California');
    fetchMock.mockResolvedValueOnce(json(place('lake-forest', 'Business', 'CA', ['store'])));
    await expect(resolveLocation('lake-forest', session)).rejects.toThrow('not a street address');
    fetchMock.mockResolvedValueOnce(json(place())).mockResolvedValueOnce(json(place('rmv-origin', 'Other city')));
    await expect(resolveLocation('lake-forest', session)).rejects.toThrow('origin');
    fetchMock.mockResolvedValueOnce(json(place())).mockResolvedValueOnce(json(place('rmv-origin', 'Rancho Mission Viejo'))).mockResolvedValueOnce(json({ routes: [] }));
    await expect(resolveLocation('lake-forest', session)).rejects.toThrow('No driving route');
    routeMocks(66); await expect(resolveLocation('lake-forest', session)).rejects.toThrow('65-mile');
  });
});
