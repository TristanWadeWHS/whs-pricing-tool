export const LOCATION_BLOCKER = 'California location search and driving-distance routing are not configured. Staff must configure an approved maps service and the Rancho Mission Viejo origin before estimates can be submitted. No distance tier has been assumed.';

// Existing service bands, applied only to a routing service's driving miles.
// A city name or straight-line distance is not routing evidence.
export function tierForDrivingMiles(miles: number) {
  if (!Number.isFinite(miles) || miles < 0 || miles > 65) return null;
  return miles <= 25 ? 'under25' : miles <= 40 ? '25to40' : '40to65';
}
export type ResolvedLocation = { id: string; label: string; state: 'CA'; drivingMiles: number };
export function isResolvedLocation(value: unknown): value is ResolvedLocation {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ResolvedLocation>;
  return typeof candidate.id === 'string' && candidate.id.length > 0 && candidate.id.length <= 200
    && typeof candidate.label === 'string' && candidate.label.length > 0 && candidate.label.length <= 80
    && candidate.state === 'CA' && typeof candidate.drivingMiles === 'number' && tierForDrivingMiles(candidate.drivingMiles) !== null;
}
