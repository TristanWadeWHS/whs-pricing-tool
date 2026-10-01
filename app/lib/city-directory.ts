import { z } from 'zod';
import directory from '../../data/locations/cities.json';
import routeData from '../../data/locations/verified-routes.json';
import { tierForDrivingMiles, type LocationSuggestion, type ResolvedLocation } from './location-resolution';

const evidence = z.object({ sourceUrl: z.url(), verifiedOn: z.iso.date(), verifiedBy: z.string().min(1) }).strict();
export const representativeRouteSchema = z.object({
  cityId: z.string().regex(/^geonames:\d+$/),
  origin: z.object({ city: z.literal('Rancho Mission Viejo'), representativePoint: z.string().min(1) }).strict(),
  destinationPoint: z.string().min(1), representativeDrivingMiles: z.number().nonnegative(), evidence,
  // A reviewer must supply supported city-level variation, not a guessed +/- buffer.
  cityDrivingRange: z.object({ min: z.number().nonnegative(), max: z.number().nonnegative(), evidence }).strict().nullable()
}).strict().refine((r) => !r.cityDrivingRange || (r.cityDrivingRange.min <= r.representativeDrivingMiles && r.cityDrivingRange.max >= r.representativeDrivingMiles),
  'Documented range must include representative driving miles.');
export type RepresentativeRoute = z.infer<typeof representativeRouteSchema>;
export const DIRECTORY_VERSION = directory.version;
export const ROUTE_VERSION = routeData.version;
export const CITY_COUNT = directory.cities.length;
const labelCounts = new Map<string, number>();
for (const c of directory.cities) { const key = `${c.name}, ${c.county}`; labelCounts.set(key, (labelCounts.get(key) ?? 0) + 1); }
const cities = directory.cities.map((c) => ({ ...c, label: `${c.name}, ${c.county}, CA${labelCounts.get(`${c.name}, ${c.county}`)! > 1 ? ` (${c.id})` : ''}` }));
const byId = new Map(cities.map((c) => [c.id, c]));
const normalize = (s: string) => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function searchCities(query: string): LocationSuggestion[] {
  const q = normalize(query);
  if (q.length < 2 || q.length > 80) return [];
  const terms = q.split(' ');
  return cities.filter((c) => terms.every((term) => normalize(c.label).includes(term)))
    .sort((a, b) => Number(normalize(b.name) === q) - Number(normalize(a.name) === q)
      || Number(normalize(b.label).startsWith(q)) - Number(normalize(a.label).startsWith(q))
      || Number(normalize(b.name).startsWith(q)) - Number(normalize(a.name).startsWith(q))
      || Number(b.countyCode === '059') - Number(a.countyCode === '059')
      || a.label.localeCompare(b.label, 'en') || a.id.localeCompare(b.id))
    .slice(0, 20).map(({ id, name, county, label, kind }) => ({ id, name, county, label, kind }));
}

export function assessRoute(record: unknown): Pick<ResolvedLocation, 'status' | 'reason' | 'distanceTier' | 'representativeDrivingMiles'> {
  const review = (reason: string, representativeDrivingMiles: number | null = null) => ({ status: 'staff_review_required' as const, reason, distanceTier: null, representativeDrivingMiles });
  if (!record) return review('Staff review required: no verified representative driving route from Rancho Mission Viejo. Staff must confirm the tier before an estimate can be relied on.');
  const parsed = representativeRouteSchema.safeParse(record);
  if (!parsed.success) return review('Staff review required: route evidence is incomplete or invalid. No tier has been assumed.');
  const r = parsed.data, miles = r.representativeDrivingMiles, tier = tierForDrivingMiles(miles);
  if (!tier) return review('Staff review required: representative route is outside the existing 65-mile service bands.', miles);
  if (!r.cityDrivingRange) return review('Staff review required: city-level route variation is not verified; the actual job could cross a tier boundary.', miles);
  if ([25, 40, 65].some((boundary) => r.cityDrivingRange!.min <= boundary && r.cityDrivingRange!.max >= boundary)) {
    return review('Staff review required: documented city routes touch or cross an existing distance-tier boundary. Confirm the actual job route.', miles);
  }
  return { status: 'verified', representativeDrivingMiles: miles, distanceTier: tier,
    reason: 'Verified representative city-level route, not exact customer-address mileage. Staff must confirm applicability to the job.' };
}

export function resolveCity(id: string): ResolvedLocation | null {
  const city = byId.get(id);
  if (!city) return null;
  const records = (routeData.records as unknown[]).filter((r) => typeof r === 'object' && r !== null && (r as { cityId?: string }).cityId === id);
  const result = assessRoute(records.length > 1 ? {} : records[0]);
  return { id: city.id, name: city.name, county: city.county, kind: city.kind, label: city.label,
    directoryVersion: DIRECTORY_VERSION, routeVersion: ROUTE_VERSION, ...result };
}
