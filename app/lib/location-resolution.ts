export const LOCATION_BLOCKER = 'Google Maps location search is not configured. Staff must configure GOOGLE_MAPS_API_KEY and WHS_MAPS_ORIGIN_PLACE_ID for Preview. No distance tier has been assumed.';
export const LOCATION_REQUIRED = 'Select a California city or neighborhood and wait for its approximate driving route before submitting an estimate.';
export type LocationSuggestion = { id: string; label: string };
export function isLocationSuggestion(value: unknown): value is LocationSuggestion {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<LocationSuggestion>;
  return typeof candidate.id === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(candidate.id)
    && typeof candidate.label === 'string' && candidate.label.length > 0 && candidate.label.length <= 80;
}

// Existing service bands, applied only to a routing service's driving miles.
// A city name or straight-line distance is not routing evidence.
export function tierForDrivingMiles(miles: number) {
  if (!Number.isFinite(miles) || miles < 0 || miles > 65) return null;
  return miles <= 25 ? 'under25' : miles <= 40 ? '25to40' : '40to65';
}
export type ResolvedLocation = LocationSuggestion & { state: 'CA'; drivingMiles: number; latitude: number; longitude: number; token: string };
export function isResolvedLocation(value: unknown): value is ResolvedLocation {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ResolvedLocation>;
  return isLocationSuggestion(value) && candidate.state === 'CA'
    && typeof candidate.latitude === 'number' && Number.isFinite(candidate.latitude) && Math.abs(candidate.latitude) <= 90
    && typeof candidate.longitude === 'number' && Number.isFinite(candidate.longitude) && Math.abs(candidate.longitude) <= 180
    && typeof candidate.token === 'string' && candidate.token.length > 0 && candidate.token.length <= 4096
    && typeof candidate.drivingMiles === 'number' && tierForDrivingMiles(candidate.drivingMiles) !== null;
}
