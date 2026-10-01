import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { isResolvedLocation, LOCATION_BLOCKER, tierForDrivingMiles, type ResolvedLocation } from './location-resolution';

export class LocationError extends Error {
  constructor(message: string, readonly status = 502) { super(message); }
}
const placeId = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/);
const areaTypes = ['locality', 'neighborhood', 'sublocality', 'sublocality_level_1'];
const placeSchema = z.object({
  id: placeId, displayName: z.object({ text: z.string().min(1) }), types: z.array(z.string()),
  addressComponents: z.array(z.object({ shortText: z.string(), longText: z.string().optional(), types: z.array(z.string()) })),
  location: z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) })
});
function config() {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  const origin = process.env.WHS_MAPS_ORIGIN_PLACE_ID;
  if (!key || !origin) throw new LocationError(LOCATION_BLOCKER, 503);
  if (!placeId.safeParse(origin).success) throw new LocationError('Staff must configure a valid Rancho Mission Viejo origin place ID.', 503);
  return { key, origin };
}
async function google(url: string, mask: string, body?: object) {
  const { key } = config();
  try {
    const response = await fetch(url, { method: body ? 'POST' : 'GET', cache: 'no-store', signal: AbortSignal.timeout(8000),
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': mask },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    if (!response.ok) throw new Error('Provider unavailable');
    return await response.json();
  } catch {
    // Never return provider bodies/URLs/headers: they may contain credentials or input.
    throw new LocationError('Google Maps could not complete the request. Retry or ask staff to check API access and quota. No tier was assumed.');
  }
}
async function details(id: string, session?: string) {
  const suffix = session ? `?sessionToken=${encodeURIComponent(session)}` : '';
  const parsed = placeSchema.safeParse(await google(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}${suffix}`,
    'id,displayName,types,addressComponents,location'));
  if (!parsed.success || parsed.data.id !== id) throw new LocationError('Google Maps returned incomplete location details. Select another result.');
  const place = parsed.data;
  if (!place.addressComponents.some((c) => c.types.includes('administrative_area_level_1') && c.shortText === 'CA')
    || !place.addressComponents.some((c) => c.types.includes('country') && c.shortText === 'US')) {
    throw new LocationError('Select a city or neighborhood in California.', 422);
  }
  return place;
}
export async function searchLocations(query: string, session: string) {
  config();
  const result = z.object({ suggestions: z.array(z.object({ placePrediction: z.object({ placeId, text: z.object({ text: z.string() }) }).optional() })).default([]) })
    .safeParse(await google('https://places.googleapis.com/v1/places:autocomplete', 'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text', {
      input: query, sessionToken: session, includedRegionCodes: ['us'], includedPrimaryTypes: areaTypes, languageCode: 'en',
      // Bounding box is only a search restriction, never routing evidence. Details verify CA.
      locationRestriction: { rectangle: { low: { latitude: 32.5, longitude: -124.5 }, high: { latitude: 42.1, longitude: -114.1 } } }
    }));
  if (!result.success) throw new LocationError('Google Maps returned invalid suggestions. Retry the search.');
  return result.data.suggestions.flatMap(({ placePrediction: p }) => p && /, (?:CA|California)(?:,|$)/.test(p.text.text)
    && p.text.text.length <= 80 ? [{ id: p.placeId, label: p.text.text }] : []).slice(0, 5);
}
function signature(payload: string) {
  return createHmac('sha256', config().key).update('whs-location-v1\0').update(payload).digest();
}
export async function resolveLocation(id: string, session: string): Promise<ResolvedLocation> {
  const { origin } = config();
  const destination = await details(id, session);
  if (!destination.types.some((type) => areaTypes.includes(type))) throw new LocationError('Select a city or neighborhood, not a street address or business.', 422);
  const start = await details(origin);
  if (!start.addressComponents.some((c) => /^(Rancho Mission Viejo)$/i.test(c.longText ?? c.shortText))
    && !/^Rancho Mission Viejo$/i.test(start.displayName.text)) {
    throw new LocationError('The configured origin is not verified as Rancho Mission Viejo. Staff must correct the origin place ID.', 503);
  }
  const route = z.object({ routes: z.array(z.object({ distanceMeters: z.number().nonnegative() })).min(1) }).safeParse(
    await google('https://routes.googleapis.com/directions/v2:computeRoutes', 'routes.distanceMeters', {
      origin: { placeId: origin }, destination: { placeId: id }, travelMode: 'DRIVE', routingPreference: 'TRAFFIC_UNAWARE', computeAlternativeRoutes: false
    }));
  if (!route.success) throw new LocationError('No driving route is available for that location. No tier was assumed.', 422);
  const drivingMiles = route.data.routes[0].distanceMeters / 1609.344;
  if (!tierForDrivingMiles(drivingMiles)) throw new LocationError('The approximate city-level route exceeds the existing 65-mile service area. Staff review is required; no tier was assigned.', 422);
  const location = { id, label: `${destination.displayName.text}, CA`.slice(0, 80), state: 'CA' as const, drivingMiles, ...destination.location };
  const payload = Buffer.from(JSON.stringify({ version: 1, origin, expires: Date.now() + 60 * 60_000, location })).toString('base64url');
  return { ...location, token: `${payload}.${signature(payload).toString('base64url')}` };
}
export function verifyLocationToken(value: FormDataEntryValue | null): ResolvedLocation {
  config();
  try {
    if (typeof value !== 'string' || value.length > 4096) throw new Error();
    const [payload, supplied, extra] = value.split('.');
    if (!payload || !supplied || extra) throw new Error();
    const expected = signature(payload), actual = Buffer.from(supplied, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error();
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    const result = { ...data.location, token: value };
    if (data.version !== 1 || data.origin !== config().origin || !Number.isFinite(data.expires) || data.expires <= Date.now() || !isResolvedLocation(result)) throw new Error();
    return result;
  } catch { throw new LocationError('Location selection is invalid or expired. Return to Location and select it again.', 400); }
}
