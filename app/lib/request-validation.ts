import { JobInputs } from './pricing';
import { IMAGE_TOO_LARGE_MESSAGE, MAX_ESTIMATE_IMAGE_BYTES, MAX_ESTIMATE_PHOTOS, SAFE_ESTIMATE_REQUEST_BODY_LIMIT_BYTES } from './estimate-limits';
import { LOCATION_REQUIRED, type ResolvedLocation } from './location-resolution';
import { resolveCity, DIRECTORY_VERSION, ROUTE_VERSION } from './city-directory';

export const ESTIMATE_LIMITS = {
  minPhotos: 1,
  maxPhotos: MAX_ESTIMATE_PHOTOS,
  maxImageBytes: MAX_ESTIMATE_IMAGE_BYTES,
  maxTotalImageBytes: SAFE_ESTIMATE_REQUEST_BODY_LIMIT_BYTES,
  maxNotesLength: 1000,
  minWorkers: 1,
  maxWorkers: 6,
  supportedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'] as const,
  supportedJobTypes: [
    'mixed junk',
    'furniture',
    'cardboard only',
    'demo debris',
    'concrete / dirt / heavy debris',
    'appliances',
    'storage relocation'
  ] as const
};

export type ValidatedEstimateRequest = {
  inputs: JobInputs;
  photos: Array<{
    file: File;
    bytes: Uint8Array;
    mime: string;
  }>;
};

export type ValidationResult =
  | { ok: true; value: ValidatedEstimateRequest }
  | { ok: false; status: number; error: string; reviewLocation?: ResolvedLocation };

const distanceTiers = new Set(['under25', '25to40', '40to65']);
const carryDistances = new Set(['curbside', 'short', 'medium', 'long']);
const stairsOptions = new Set(['none', 'some', 'heavy']);
const jobTypes = new Set<string>(ESTIMATE_LIMITS.supportedJobTypes);
const mimeTypes = new Set<string>(ESTIMATE_LIMITS.supportedMimeTypes);

export async function validateEstimateForm(form: FormData): Promise<ValidationResult> {
  let city: ResolvedLocation | null = null;
  let staffTier: JobInputs['distanceTier'] | null = null;
  if (form.getAll('workflow').length > 1) return invalid('Duplicate workflow.');
  if (form.has('workflow') || form.has('cityId')) {
    if (form.get('workflow') !== 'guided-city-v3') return invalid('Location workflow changed. Refresh and select a city from the local directory.');
    if (form.getAll('cityId').length !== 1 || typeof form.get('cityId') !== 'string') return invalid(LOCATION_REQUIRED);
    city = resolveCity(String(form.get('cityId')));
    if (!city) return invalid(LOCATION_REQUIRED);
    if (form.get('directoryVersion') !== DIRECTORY_VERSION || form.get('routeVersion') !== ROUTE_VERSION) return invalid('City or route data changed. Refresh and reselect the city.');
    if (form.has('distanceTier') || form.has('locationToken')) return invalid('City tiers must come from the local verified route records, not browser fields.');
  }
  if (form.has('staffDistanceTier')) {
    const value = form.get('staffDistanceTier');
    if (!city || city.status === 'verified' || form.getAll('staffDistanceTier').length !== 1
      || typeof value !== 'string' || !distanceTiers.has(value)) return invalid('Select one valid staff-confirmed distance tier for an unverified city.');
    staffTier = value as JobInputs['distanceTier'];
  }
  const rawFiles = form.getAll('photos');
  const files = rawFiles.filter((value): value is File => value instanceof File);

  if (rawFiles.length !== files.length) {
    return invalid('One or more uploaded photo fields were invalid.');
  }

  if (files.length < ESTIMATE_LIMITS.minPhotos) {
    return invalid('Upload at least one photo.');
  }

  if (files.length > ESTIMATE_LIMITS.maxPhotos) {
    return invalid(`Upload no more than ${ESTIMATE_LIMITS.maxPhotos} photos.`);
  }

  const distanceTier = city ? city.distanceTier ?? staffTier : String(form.get('distanceTier') || '');
  const selectedTypes = form.getAll('jobType');
  const carryDistance = String(form.get('carryDistance') || '');
  const stairs = String(form.get('stairs') || '');
  const notes = String(form.get('notes') || '').trim();
  // The guided form does not collect crew size. Missing is unknown, not one worker.
  const workers = form.has('workers') ? Number(form.get('workers')) : null;

  if (!city && !distanceTiers.has(distanceTier ?? '')) {
    return invalid('Select a valid distance tier.');
  }

  if (!selectedTypes.length || selectedTypes.length > jobTypes.size || new Set(selectedTypes).size !== selectedTypes.length
    || !selectedTypes.every((type) => typeof type === 'string' && jobTypes.has(type))) {
    return invalid('Select one or more distinct valid job types.');
  }

  if (!carryDistances.has(carryDistance)) {
    return invalid('Select a valid carry-distance option.');
  }

  if (!stairsOptions.has(stairs)) {
    return invalid('Select a valid stairs option.');
  }

  if (workers !== null && (!Number.isInteger(workers) || workers < ESTIMATE_LIMITS.minWorkers || workers > ESTIMATE_LIMITS.maxWorkers)) {
    return invalid(`Workers planned must be a whole number from ${ESTIMATE_LIMITS.minWorkers} to ${ESTIMATE_LIMITS.maxWorkers}.`);
  }

  if (notes.length > ESTIMATE_LIMITS.maxNotesLength) {
    return invalid(`Employee notes must be ${ESTIMATE_LIMITS.maxNotesLength} characters or fewer.`);
  }

  const photos = [];
  let totalImageBytes = 0;
  for (const file of files) {
    if (!mimeTypes.has(file.type)) {
      return invalid('Photos must be JPEG, PNG, or WebP images.');
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength === 0) {
      return invalid('Uploaded photos cannot be empty.');
    }

    if (bytes.byteLength > ESTIMATE_LIMITS.maxImageBytes) {
      return invalid('Each photo must be 3 MB or smaller.');
    }

    totalImageBytes += bytes.byteLength;
    if (totalImageBytes > ESTIMATE_LIMITS.maxTotalImageBytes) {
      return invalid(IMAGE_TOO_LARGE_MESSAGE);
    }

    if (!matchesImageSignature(bytes, file.type)) {
      return invalid('A photo file type did not match its image content.');
    }

    photos.push({ file, bytes, mime: file.type });
  }

  if (city?.status === 'staff_review_required' && !staffTier) return { ok: false, status: 422, error: city.reason, reviewLocation: city };
  return {
    ok: true,
    value: {
      inputs: {
        distanceTier: distanceTier as JobInputs['distanceTier'],
        jobType: selectedTypes.join(', '),
        jobTypes: selectedTypes as string[],
        carryDistance: carryDistance as JobInputs['carryDistance'],
        stairs: stairs as JobInputs['stairs'],
        workers,
        notes,
        ...(city ? { location: city, distanceTierSource: staffTier ? 'staff_confirmed' as const : 'verified_city_route' as const } : {})
      },
      photos
    }
  };
}

export function matchesImageSignature(bytes: Uint8Array, mime: string) {
  if (mime === 'image/jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }

  if (mime === 'image/png') {
    return bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a;
  }

  if (mime === 'image/webp') {
    return bytes.length >= 12 &&
      ascii(bytes, 0, 4) === 'RIFF' &&
      ascii(bytes, 8, 12) === 'WEBP';
  }

  return false;
}

function ascii(bytes: Uint8Array, start: number, end: number) {
  return String.fromCharCode(...bytes.slice(start, end));
}

function invalid(error: string): ValidationResult {
  return { ok: false, status: 400, error };
}
