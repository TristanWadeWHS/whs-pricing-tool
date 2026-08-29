import { describe, expect, it } from 'vitest';
import {
  buildAnalyzeFormWithOptimizedPhotos,
  getOptimizationTargets,
  getProcessedImageBudget,
  optimizePhotoSelection,
  OPTIMIZATION_MESSAGES,
  PHOTO_OPTIMIZATION_LIMITS,
  type PhotoOptimizerAdapter
} from '../app/lib/photo-optimizer';
import {
  MAX_ESTIMATE_IMAGE_BYTES,
  SAFE_ESTIMATE_REQUEST_BODY_LIMIT_BYTES
} from '../app/lib/estimate-limits';

function file(name: string, type: string, size: number) {
  return new File([new Uint8Array(size)], name, { type });
}

function adapterFor(options: {
  width?: number;
  height?: number;
  failDecodeFor?: string[];
  minimumEncodedBytes?: number;
  compressionDivisor?: number;
} = {}): PhotoOptimizerAdapter {
  const {
    width = 4032,
    height = 3024,
    failDecodeFor = [],
    minimumEncodedBytes = 180 * 1024,
    compressionDivisor = 4.5
  } = options;

  return {
    async decode(input) {
      if (failDecodeFor.includes(input.type)) {
        throw new Error('decode failed');
      }
      return { width, height, source: {} as CanvasImageSource };
    },
    async encode(_image, target) {
      const pixels = target.width * target.height;
      const size = Math.max(minimumEncodedBytes, Math.floor((pixels * target.quality) / compressionDivisor));
      return new Blob([new Uint8Array(size)], { type: 'image/jpeg' });
    }
  };
}

describe('photo optimization', () => {
  it('optimizes a normal oversized iPhone-style JPEG below the server image limit', async () => {
    const result = await optimizePhotoSelection([file('iphone.jpg', 'image/jpeg', 6 * 1024 * 1024)], adapterFor());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.photos[0].file.type).toBe('image/jpeg');
    expect(result.photos[0].optimizedBytes).toBeLessThanOrEqual(MAX_ESTIMATE_IMAGE_BYTES);
    expect(result.photos[0].width).toBeLessThanOrEqual(PHOTO_OPTIMIZATION_LIMITS.initialLongEdge);
    expect(result.message).toBe(OPTIMIZATION_MESSAGES.ready);
  });

  it('resizes large pixel dimensions while preserving orientation ratio from browser decoding', async () => {
    const result = await optimizePhotoSelection([file('portrait.jpg', 'image/jpeg', 5 * 1024 * 1024)], adapterFor({ width: 3024, height: 4032 }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.photos[0].height).toBeGreaterThan(result.photos[0].width);
    expect(result.photos[0].height).toBeLessThanOrEqual(PHOTO_OPTIMIZATION_LIMITS.initialLongEdge);
  });

  it('accepts large PNG and WebP inputs and outputs metadata-stripped JPEG files', async () => {
    const result = await optimizePhotoSelection([
      file('garage.png', 'image/png', 7 * 1024 * 1024),
      file('pile.webp', 'image/webp', 4 * 1024 * 1024)
    ], adapterFor());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.photos.map((photo) => photo.file.name)).toEqual(['garage.jpg', 'pile.jpg']);
    expect(result.photos.every((photo) => photo.file.type === 'image/jpeg')).toBe(true);
  });

  it('uses a larger single-image budget and a smaller multi-image budget', () => {
    expect(getProcessedImageBudget(1)).toBe(MAX_ESTIMATE_IMAGE_BYTES);
    expect(getProcessedImageBudget(4)).toBeLessThan(MAX_ESTIMATE_IMAGE_BYTES);
  });

  it('keeps multiple optimized images under the combined safe ceiling', async () => {
    const result = await optimizePhotoSelection([
      file('a.jpg', 'image/jpeg', 5 * 1024 * 1024),
      file('b.jpg', 'image/jpeg', 5 * 1024 * 1024),
      file('c.jpg', 'image/jpeg', 5 * 1024 * 1024)
    ], adapterFor());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.totalBytes).toBeLessThanOrEqual(SAFE_ESTIMATE_REQUEST_BODY_LIMIT_BYTES);
    expect(result.photos).toHaveLength(3);
  });

  it('performs an additional compression pass when the first pass remains too large', async () => {
    const result = await optimizePhotoSelection([
      file('a.jpg', 'image/jpeg', 5 * 1024 * 1024),
      file('b.jpg', 'image/jpeg', 5 * 1024 * 1024)
    ], adapterFor({ compressionDivisor: 1 }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.totalBytes).toBeLessThanOrEqual(SAFE_ESTIMATE_REQUEST_BODY_LIMIT_BYTES);
    expect(result.photos.some((photo) => photo.additionalPasses > 0)).toBe(true);
  });

  it('stops with a controlled failure instead of exceeding minimum quality and dimensions', async () => {
    const result = await optimizePhotoSelection([file('huge.jpg', 'image/jpeg', 8 * 1024 * 1024)], adapterFor({ minimumEncodedBytes: MAX_ESTIMATE_IMAGE_BYTES + 1 }));

    expect(result).toEqual({ ok: false, error: OPTIMIZATION_MESSAGES.failed });
  });

  it('reports unsupported formats and unsupported HEIC decode separately', async () => {
    await expect(optimizePhotoSelection([file('scan.gif', 'image/gif', 1024)], adapterFor())).resolves.toEqual({
      ok: false,
      error: 'Photos must be JPEG, PNG, WebP, or browser-supported HEIC images.'
    });

    await expect(optimizePhotoSelection([file('photo.heic', 'image/heic', 4 * 1024 * 1024)], adapterFor({ failDecodeFor: ['image/heic'] }))).resolves.toEqual({
      ok: false,
      error: OPTIMIZATION_MESSAGES.unsupportedHeic
    });
  });

  it('rejects unreasonably large original files before decode work', async () => {
    const result = await optimizePhotoSelection([file('too-large.jpg', 'image/jpeg', PHOTO_OPTIMIZATION_LIMITS.maxOriginalBytes + 1)], adapterFor());

    expect(result).toEqual({ ok: false, error: OPTIMIZATION_MESSAGES.failed });
  });

  it('rejects more than five selected photos before optimization work', async () => {
    const result = await optimizePhotoSelection(Array.from({ length: 6 }, (_, index) => file(`p${index}.jpg`, 'image/jpeg', 1024)), adapterFor());

    expect(result).toEqual({ ok: false, error: 'Upload no more than 5 photos.' });
  });

  it('generates bounded targets without an infinite compression loop', () => {
    const targets = getOptimizationTargets(8000, 6000);

    expect(targets.length).toBeGreaterThan(1);
    expect(targets.length).toBeLessThan(100);
    expect(Math.max(...targets.map((target) => target.width))).toBeLessThanOrEqual(PHOTO_OPTIMIZATION_LIMITS.initialLongEdge);
    expect(Math.min(...targets.map((target) => target.quality))).toBeGreaterThanOrEqual(PHOTO_OPTIMIZATION_LIMITS.minimumQuality);
  });

  it('builds submission data with only processed files and preserves form fields', () => {
    const form = new FormData();
    form.append('photos', file('original.jpg', 'image/jpeg', 4 * 1024 * 1024));
    form.set('distanceTier', 'under25');
    form.set('notes', 'short walk');

    const processed = file('original.jpg', 'image/jpeg', 500 * 1024);
    const nextForm = buildAnalyzeFormWithOptimizedPhotos(form, [processed]);

    expect(nextForm.get('distanceTier')).toBe('under25');
    expect(nextForm.get('notes')).toBe('short walk');
    expect(nextForm.getAll('photos')).toEqual([processed]);
  });
});
