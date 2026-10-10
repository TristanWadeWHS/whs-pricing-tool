import {
  IMAGE_TOO_LARGE_MESSAGE,
  MAX_ESTIMATE_IMAGE_BYTES,
  MAX_ESTIMATE_PHOTOS,
  SAFE_ESTIMATE_REQUEST_BODY_LIMIT_BYTES
} from './estimate-limits';

export const OPTIMIZATION_MESSAGES = {
  optimizing: 'Optimizing photos for analysis...',
  ready: 'Photos optimized and ready.',
  failed: "We couldn't optimize one or more photos. Please try fewer photos or choose another image.",
  unsupportedHeic: 'This HEIC/HEIF photo could not be prepared. Your other photos are retained. Retry after the original finishes downloading from iCloud, or choose a JPEG copy.'
};

export const PHOTO_INPUT_ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif';

export const PHOTO_OPTIMIZATION_LIMITS = {
  maxPhotos: MAX_ESTIMATE_PHOTOS,
  maxOriginalBytes: 25 * 1024 * 1024,
  totalProcessedBytes: SAFE_ESTIMATE_REQUEST_BODY_LIMIT_BYTES,
  maxProcessedImageBytes: MAX_ESTIMATE_IMAGE_BYTES,
  initialLongEdge: 2048,
  minimumLongEdge: 1280,
  initialQuality: 0.84,
  minimumQuality: 0.68,
  qualityStep: 0.04,
  dimensionStep: 0.85
};

const SUPPORTED_INPUT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif'
]);

const HEIC_TYPES = new Set(['image/heic', 'image/heif']);

function inputType(file: File) {
  if (file.type && file.type !== 'application/octet-stream') return file.type.toLowerCase();
  const extension = file.name.split('.').pop()?.toLowerCase();
  return ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif' } as Record<string, string>)[extension ?? ''] ?? '';
}

export type OptimizedPhoto = {
  originalName: string;
  file: File;
  originalBytes: number;
  optimizedBytes: number;
  width: number;
  height: number;
  quality: number;
  additionalPasses: number;
};

export type OptimizeSelectionResult =
  | { ok: true; photos: OptimizedPhoto[]; totalBytes: number; message: string }
  | PhotoFailure;

type FailureStage = 'input-empty' | 'input-byte-limit' | 'decode' | 'dimensions' | 'encode-exception' | 'encode-empty' | 'processed-budget';
type PhotoFailure = { ok: false; error: string; diagnostic?: {
  stage: FailureStage; mime: string; extension: string; originalBytes: number;
  budgetBytes: number; width: number | null; height: number | null;
  processedBytes: number | null; decoder: string; errorCategory: string;
} };

function photoFailure(file: File, stage: FailureStage, budgetBytes: number, decoded: DecodedImage | null = null,
  processedBytes: number | null = null, error?: unknown): PhotoFailure {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const name = error instanceof Error ? error.name : '';
  return { ok: false, error: stage === 'decode' && HEIC_TYPES.has(inputType(file)) ? OPTIMIZATION_MESSAGES.unsupportedHeic : OPTIMIZATION_MESSAGES.failed,
    diagnostic: { stage, mime: [...SUPPORTED_INPUT_TYPES, 'application/octet-stream'].includes(file.type) ? file.type : file.type ? 'other' : 'empty',
      extension: ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(ext) ? ext : 'other', originalBytes: file.size, budgetBytes,
      width: decoded && Number.isFinite(decoded.width) ? decoded.width : null, height: decoded && Number.isFinite(decoded.height) ? decoded.height : null,
      processedBytes, decoder: decoded?.decoder ?? 'unavailable',
      errorCategory: ['EncodingError', 'InvalidStateError', 'NotReadableError', 'NotSupportedError', 'SecurityError', 'AbortError', 'TimeoutError'].includes(name) ? name : 'unavailable' } };
}

// Display only bounded technical metadata, never filenames, exception messages,
// EXIF, photo bytes or credentials. It stays in this tab; no telemetry is sent.
export function photoFailureMessage(result: PhotoFailure) {
  const d = result.diagnostic;
  if (!d) return result.error;
  return `${result.error} Photo check: ${d.stage}; type ${d.mime}; extension ${d.extension}; original ${d.originalBytes} bytes; decoded ${d.width ?? '?'} x ${d.height ?? '?'}; processed ${d.processedBytes ?? '?'} bytes; budget ${d.budgetBytes} bytes; decoder ${d.decoder}; category ${d.errorCategory}. Not uploaded.`;
}

type DecodedImage = {
  width: number;
  height: number;
  source: CanvasImageSource;
  close?: () => void;
  decoder?: 'bitmap' | 'image-element' | 'heic-fallback';
};

type OptimizePhotoFileResult =
  | { ok: true; photo: OptimizedPhoto }
  | PhotoFailure;

export type PhotoOptimizerAdapter = {
  decode(file: File): Promise<DecodedImage>;
  encode(image: DecodedImage, target: { width: number; height: number; quality: number }): Promise<Blob | null>;
};

export async function optimizePhotoSelection(files: File[], adapter = browserPhotoOptimizerAdapter, reservedSlots = files.length): Promise<OptimizeSelectionResult> {
  if (files.length === 0) {
    return { ok: false, error: 'Upload at least one photo.' };
  }

  if (files.length > PHOTO_OPTIMIZATION_LIMITS.maxPhotos) {
    return { ok: false, error: `Upload no more than ${PHOTO_OPTIMIZATION_LIMITS.maxPhotos} photos.` };
  }

  if (!Number.isInteger(reservedSlots) || reservedSlots < files.length || reservedSlots > MAX_ESTIMATE_PHOTOS) return { ok: false, error: 'Invalid photo capacity.' };
  const initialBudget = getProcessedImageBudget(reservedSlots, reservedSlots === files.length);
  const firstPass = await optimizeWithBudget(files, initialBudget, adapter);
  if (!firstPass.ok) return firstPass;

  const totalBytes = sumOptimizedBytes(firstPass.photos);
  if (totalBytes <= PHOTO_OPTIMIZATION_LIMITS.totalProcessedBytes) {
    return { ok: true, photos: firstPass.photos, totalBytes, message: buildReadyMessage(firstPass.photos) };
  }

  const finalBudget = getProcessedImageBudget(reservedSlots, false);
  const finalPass = await optimizeWithBudget(files, finalBudget, adapter);
  if (!finalPass.ok) return finalPass;

  const finalTotalBytes = sumOptimizedBytes(finalPass.photos);
  if (finalTotalBytes > PHOTO_OPTIMIZATION_LIMITS.totalProcessedBytes) {
    return { ok: false, error: IMAGE_TOO_LARGE_MESSAGE };
  }

  return { ok: true, photos: finalPass.photos, totalBytes: finalTotalBytes, message: buildReadyMessage(finalPass.photos) };
}

export function buildAnalyzeFormWithOptimizedPhotos(formData: FormData, photos: File[]) {
  const nextFormData = new FormData();
  for (const [key, value] of formData.entries()) {
    if (key !== 'photos') {
      nextFormData.append(key, value);
    }
  }

  for (const photo of photos) {
    nextFormData.append('photos', photo);
  }

  return nextFormData;
}

export function getProcessedImageBudget(fileCount: number, preserveSingleImageDetail = false) {
  const count = Math.max(1, fileCount);
  const totalBudget = PHOTO_OPTIMIZATION_LIMITS.totalProcessedBytes;
  const fairShare = Math.floor(totalBudget / count);
  const preferredShare = preserveSingleImageDetail ? Math.floor(fairShare * 1.15) : fairShare;
  return Math.min(PHOTO_OPTIMIZATION_LIMITS.maxProcessedImageBytes, preferredShare);
}

async function optimizeWithBudget(files: File[], budgetBytes: number, adapter: PhotoOptimizerAdapter): Promise<OptimizeSelectionResult> {
  const photos = [];
  for (const file of files) {
    const optimized = await optimizePhotoFile(file, budgetBytes, adapter);
    if (optimized.ok === false) return optimized;
    photos.push(optimized.photo);
  }

  return { ok: true, photos, totalBytes: sumOptimizedBytes(photos), message: buildReadyMessage(photos) };
}

async function optimizePhotoFile(file: File, budgetBytes: number, adapter: PhotoOptimizerAdapter): Promise<OptimizePhotoFileResult> {
  if (!SUPPORTED_INPUT_TYPES.has(inputType(file))) {
    return { ok: false as const, error: 'Photos must be JPEG, PNG, WebP, HEIC, or HEIF images.' };
  }

  if (file.size > PHOTO_OPTIMIZATION_LIMITS.maxOriginalBytes) {
    return photoFailure(file, 'input-byte-limit', budgetBytes);
  }
  if (!file.size) return photoFailure(file, 'input-empty', budgetBytes);

  let decoded: DecodedImage | null = null;
  try {
    decoded = await adapter.decode(file);
  } catch (error) {
    return photoFailure(file, 'decode', budgetBytes, null, null, error);
  }

  let smallestEncodedBytes: number | null = null;
  try {
    const targets = getOptimizationTargets(decoded.width, decoded.height);
    if (!targets.length) return photoFailure(file, 'dimensions', budgetBytes, decoded);
    for (const target of targets) {
      const blob = await adapter.encode(decoded, target);
      if (!blob || !blob.size) continue;
      smallestEncodedBytes = Math.min(smallestEncodedBytes ?? blob.size, blob.size);

      if (blob.size <= budgetBytes && blob.size <= PHOTO_OPTIMIZATION_LIMITS.maxProcessedImageBytes) {
        const outputName = replaceImageExtension(file.name);
        return {
          ok: true as const,
          photo: {
            originalName: file.name,
            file: new File([blob], outputName, { type: 'image/jpeg', lastModified: Date.now() }),
            originalBytes: file.size,
            optimizedBytes: blob.size,
            width: target.width,
            height: target.height,
            quality: target.quality,
            additionalPasses: target.additionalPasses
          }
        };
      }
    }
  } catch (error) {
    return photoFailure(file, 'encode-exception', budgetBytes, decoded, smallestEncodedBytes, error);
  } finally {
    decoded.close?.();
  }

  return photoFailure(file, smallestEncodedBytes === null ? 'encode-empty' : 'processed-budget', budgetBytes, decoded, smallestEncodedBytes);
}

export function getOptimizationTargets(width: number, height: number) {
  const longEdge = Math.max(width, height);
  if (!Number.isFinite(longEdge) || width <= 0 || height <= 0) return [];
  const baseScale = Math.min(1, PHOTO_OPTIMIZATION_LIMITS.initialLongEdge / longEdge);
  const targets = [];
  let scaledLongEdge = Math.round(longEdge * baseScale);
  let additionalPasses = 0;

  // Small library exports should keep their native size, not fail or be upscaled.
  const minimumLongEdge = Math.min(longEdge, PHOTO_OPTIMIZATION_LIMITS.minimumLongEdge);
  while (scaledLongEdge >= minimumLongEdge) {
    const scale = scaledLongEdge / longEdge;
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));

    for (
      let quality = PHOTO_OPTIMIZATION_LIMITS.initialQuality;
      quality >= PHOTO_OPTIMIZATION_LIMITS.minimumQuality - 0.001;
      quality -= PHOTO_OPTIMIZATION_LIMITS.qualityStep
    ) {
      targets.push({
        width: targetWidth,
        height: targetHeight,
        quality: Number(quality.toFixed(2)),
        additionalPasses
      });
      additionalPasses += quality === PHOTO_OPTIMIZATION_LIMITS.initialQuality ? 0 : 1;
    }

    // Always try the configured floor: a multiplicative step can skip over it.
    if (scaledLongEdge === minimumLongEdge) break;
    scaledLongEdge = Math.max(minimumLongEdge, Math.floor(scaledLongEdge * PHOTO_OPTIMIZATION_LIMITS.dimensionStep));
    additionalPasses += 1;
  }

  return targets;
}

function buildReadyMessage(photos: OptimizedPhoto[]) {
  const optimizedCount = photos.filter((photo) => photo.optimizedBytes < photo.originalBytes).length;
  return optimizedCount > 0 ? OPTIMIZATION_MESSAGES.ready : `${photos.length} photo(s) ready.`;
}

function replaceImageExtension(name: string) {
  const base = name.replace(/\.[^.]+$/, '') || 'photo';
  return `${base}.jpg`;
}

function sumOptimizedBytes(photos: OptimizedPhoto[]) {
  return photos.reduce((total, photo) => total + photo.optimizedBytes, 0);
}

export const browserPhotoOptimizerAdapter: PhotoOptimizerAdapter = {
  async decode(file) {
    try {
      return await decodeNativePhoto(file);
    } catch {
      if (!HEIC_TYPES.has(inputType(file))) throw new Error('Image decode failed.');
    }
    // Lazy, local-only libheif fallback. Its decoder applies HEIF transforms;
    // PNG pixels contain that orientation already, so do not rotate again.
    const { heicTo } = await import('heic-to/csp');
    const converted = await heicTo({ blob: file, type: 'image/png' });
    return { ...await decodeNativePhoto(converted), decoder: 'heic-fallback' };
  },

  async encode(image, target) {
    const canvas = document.createElement('canvas');
    canvas.width = target.width;
    canvas.height = target.height;

    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return null;

    context.drawImage(image.source, 0, 0, target.width, target.height);
    return new Promise((resolve) => {
      canvas.toBlob((blob) => { canvas.width = 1; canvas.height = 1; resolve(blob); }, 'image/jpeg', target.quality);
    });
  }
};

async function decodeNativePhoto(file: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { width: bitmap.width, height: bitmap.height, source: bitmap, close: () => bitmap.close(), decoder: 'bitmap' };
    } catch { /* Safari may decode a library image through <img> but not ImageBitmap. */ }
  }
  const image = await decodeWithImageElement(file);
  return { width: image.naturalWidth, height: image.naturalHeight, source: image, close: () => { image.src = ''; }, decoder: 'image-element' };
}

function decodeWithImageElement(file: Blob) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    const timeout = setTimeout(() => { URL.revokeObjectURL(url); image.src = ''; reject(new Error('Image decode timed out.')); }, 30_000);
    image.onload = () => {
      clearTimeout(timeout);
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      clearTimeout(timeout);
      URL.revokeObjectURL(url);
      reject(new Error('Image decode failed.'));
    };
    image.src = url;
  });
}
