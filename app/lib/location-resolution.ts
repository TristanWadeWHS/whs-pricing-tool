export const LOCATION_REQUIRED = 'Select a city and county from the local directory. Free text is not a verified location.';
export type DistanceTier = 'under25' | '25to40' | '40to65';
// Existing bands only. Never apply these to geographic/straight-line distances.
export function tierForDrivingMiles(miles: number): DistanceTier | null {
  if (!Number.isFinite(miles) || miles < 0 || miles > 65) return null;
  return miles <= 25 ? 'under25' : miles <= 40 ? '25to40' : '40to65';
}
export type LocationSuggestion = { id: string; name: string; county: string; label: string; kind: string };
export type ResolvedLocation = LocationSuggestion & {
  directoryVersion: string; routeVersion: string;
  status: 'verified' | 'staff_review_required'; reason: string;
  representativeDrivingMiles: number | null; distanceTier: DistanceTier | null;
};
export function isLocationSuggestion(value: unknown): value is LocationSuggestion {
  if (!value || typeof value !== 'object') return false;
  const c = value as Partial<LocationSuggestion>;
  return typeof c.id === 'string' && /^geonames:\d+$/.test(c.id)
    && typeof c.name === 'string' && typeof c.county === 'string'
    && typeof c.label === 'string' && c.label.length <= 160 && typeof c.kind === 'string';
}
// Shape check for UI only. Server always re-resolves the ID against versioned data.
export function isResolvedLocation(value: unknown): value is ResolvedLocation {
  if (!isLocationSuggestion(value)) return false;
  const c = value as ResolvedLocation;
  return typeof c.directoryVersion === 'string' && typeof c.routeVersion === 'string' && typeof c.reason === 'string'
    && (c.status === 'staff_review_required' ? c.distanceTier === null
      : c.status === 'verified' && typeof c.representativeDrivingMiles === 'number'
        && tierForDrivingMiles(c.representativeDrivingMiles) !== null && c.distanceTier === tierForDrivingMiles(c.representativeDrivingMiles));
}
