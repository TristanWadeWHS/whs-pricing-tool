import {
  IMAGE_TOO_LARGE_MESSAGE,
  MAX_ESTIMATE_IMAGE_BYTES,
  SAFE_ESTIMATE_REQUEST_BODY_LIMIT_BYTES
} from './estimate-limits';

export const OPTIMIZATION_MESSAGES = {
  optimizing: 'Optimizing photos for analysis...',
  ready: 'Photos optimized and ready.',
  failed: "We couldn't optimize one or more photos. Please try fewer photos or choose another image.",
  unsupportedHeic: 'This HEIC photo could not be processed in this browser. Please change your iPhone Camera Format to Most Compatible or upload a JPEG.'
};

export const PHOTO_OPTIMIZATION_LIMITS = {
  maxPhotos: 5,
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
  | { ok: false; error: string };

type DecodedImage = {
  width: number;
  height: number;
  source: CanvasImageSource;
  close?: () => void;
};

type OptimizePhotoFileResult =
  | { ok: true; photo: OptimizedPhoto }
  | { ok: false; error: string };

export type PhotoOptimizerAdapter = {
  decode(file: File): Promise<DecodedImage>;
  encode(image: DecodedImage, target: { width: number; height: number; quality: number }): Promise<Blob | null>;
};

export async function optimizePhotoSelection(files: File[], adapter = browserPhotoOptimizerAdapter): Promise<OptimizeSelectionResult> {
  if (files.length === 0) {
    return { ok: false, error: 'Upload at least one photo.' };
  }

  if (files.length > PHOTO_OPTIMIZATION_LIMITS.maxPhotos) {
    return { ok: false, error: `Upload no more than ${PHOTO_OPTIMIZATION_LIMITS.maxPhotos} photos.` };
  }

  const initialBudget = getProcessedImageBudget(files.length, true);
  const firstPass = await optimizeWithBudget(files, initialBudget, adapter);
  if (!firstPass.ok) return firstPass;

  const totalBytes = sumOptimizedBytes(firstPass.photos);
  if (totalBytes <= PHOTO_OPTIMIZATION_LIMITS.totalProcessedBytes) {
    return { ok: true, photos: firstPass.photos, totalBytes, message: buildReadyMessage(firstPass.photos) };
  }

  const finalBudget = getProcessedImageBudget(files.length, false);
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
    if (optimized.ok === false) return { ok: false, error: optimized.error };
    photos.push(optimized.photo);
  }

  return { ok: true, photos, totalBytes: sumOptimizedBytes(photos), message: buildReadyMessage(photos) };
}

async function optimizePhotoFile(file: File, budgetBytes: number, adapter: PhotoOptimizerAdapter): Promise<OptimizePhotoFileResult> {
  if (!SUPPORTED_INPUT_TYPES.has(file.type)) {
    return { ok: false as const, error: 'Photos must be JPEG, PNG, WebP, or browser-supported HEIC images.' };
  }

  if (file.size > PHOTO_OPTIMIZATION_LIMITS.maxOriginalBytes) {
    return { ok: false as const, error: OPTIMIZATION_MESSAGES.failed };
  }

  let decoded: DecodedImage | null = null;
  try {
    decoded = await adapter.decode(file);
  } catch {
    return { ok: false as const, error: HEIC_TYPES.has(file.type) ? OPTIMIZATION_MESSAGES.unsupportedHeic : OPTIMIZATION_MESSAGES.failed };
  }

  try {
    for (const target of getOptimizationTargets(decoded.width, decoded.height)) {
      const blob = await adapter.encode(decoded, target);
      if (!blob) continue;

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
  } finally {
    decoded.close?.();
  }

  return { ok: false as const, error: OPTIMIZATION_MESSAGES.failed };
}

export function getOptimizationTargets(width: number, height: number) {
  const longEdge = Math.max(width, height);
  const baseScale = Math.min(1, PHOTO_OPTIMIZATION_LIMITS.initialLongEdge / longEdge);
  const targets = [];
  let scaledLongEdge = Math.round(longEdge * baseScale);
  let additionalPasses = 0;

  while (scaledLongEdge >= PHOTO_OPTIMIZATION_LIMITS.minimumLongEdge) {
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

    scaledLongEdge = Math.floor(scaledLongEdge * PHOTO_OPTIMIZATION_LIMITS.dimensionStep);
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
    if ('createImageBitmap' in window) {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return {
        width: bitmap.width,
        height: bitmap.height,
        source: bitmap,
        close: () => bitmap.close()
      };
    }

    const image = await decodeWithImageElement(file);
    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      source: image
    };
  },

  async encode(image, target) {
    const canvas = document.createElement('canvas');
    canvas.width = target.width;
    canvas.height = target.height;

    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return null;

    context.drawImage(image.source, 0, 0, target.width, target.height);
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', target.quality);
    });
  }
};

function decodeWithImageElement(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Image decode failed.'));
    };
    image.src = url;
  });
}
