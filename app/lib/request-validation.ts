import { JobInputs } from './pricing';

export const ESTIMATE_LIMITS = {
  minPhotos: 1,
  maxPhotos: 5,
  maxImageBytes: 8 * 1024 * 1024,
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
  | { ok: false; status: number; error: string };

const distanceTiers = new Set(['under25', '25to40', '40to65']);
const carryDistances = new Set(['curbside', 'short', 'medium', 'long']);
const stairsOptions = new Set(['none', 'some', 'heavy']);
const jobTypes = new Set<string>(ESTIMATE_LIMITS.supportedJobTypes);
const mimeTypes = new Set<string>(ESTIMATE_LIMITS.supportedMimeTypes);

export async function validateEstimateForm(form: FormData): Promise<ValidationResult> {
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

  const distanceTier = String(form.get('distanceTier') || '');
  const jobType = String(form.get('jobType') || '');
  const carryDistance = String(form.get('carryDistance') || '');
  const stairs = String(form.get('stairs') || '');
  const notes = String(form.get('notes') || '').trim();
  const workers = Number(form.get('workers'));

  if (!distanceTiers.has(distanceTier)) {
    return invalid('Select a valid distance tier.');
  }

  if (!jobTypes.has(jobType)) {
    return invalid('Select a valid job type.');
  }

  if (!carryDistances.has(carryDistance)) {
    return invalid('Select a valid carry-distance option.');
  }

  if (!stairsOptions.has(stairs)) {
    return invalid('Select a valid stairs option.');
  }

  if (!Number.isInteger(workers) || workers < ESTIMATE_LIMITS.minWorkers || workers > ESTIMATE_LIMITS.maxWorkers) {
    return invalid(`Workers planned must be a whole number from ${ESTIMATE_LIMITS.minWorkers} to ${ESTIMATE_LIMITS.maxWorkers}.`);
  }

  if (notes.length > ESTIMATE_LIMITS.maxNotesLength) {
    return invalid(`Employee notes must be ${ESTIMATE_LIMITS.maxNotesLength} characters or fewer.`);
  }

  const photos = [];
  for (const file of files) {
    if (!mimeTypes.has(file.type)) {
      return invalid('Photos must be JPEG, PNG, or WebP images.');
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength === 0) {
      return invalid('Uploaded photos cannot be empty.');
    }

    if (bytes.byteLength > ESTIMATE_LIMITS.maxImageBytes) {
      return invalid('Each photo must be 8 MB or smaller.');
    }

    if (!matchesImageSignature(bytes, file.type)) {
      return invalid('A photo file type did not match its image content.');
    }

    photos.push({ file, bytes, mime: file.type });
  }

  return {
    ok: true,
    value: {
      inputs: {
        distanceTier: distanceTier as JobInputs['distanceTier'],
        jobType,
        carryDistance: carryDistance as JobInputs['carryDistance'],
        stairs: stairs as JobInputs['stairs'],
        workers,
        notes
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

