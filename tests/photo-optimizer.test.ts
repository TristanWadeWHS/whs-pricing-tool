import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  buildAnalyzeFormWithOptimizedPhotos,
  getOptimizationTargets,
  getProcessedImageBudget,
  optimizePhotoSelection,
  OPTIMIZATION_MESSAGES,
  PHOTO_OPTIMIZATION_LIMITS,
  browserPhotoOptimizerAdapter,
  PHOTO_INPUT_ACCEPT,
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
  it('reserves a ten-photo transport budget across separate room batches without recompressing prior photos', async () => {
    const batches = [];
    for (const count of [3, 7]) {
      const result = await optimizePhotoSelection(Array.from({ length: count }, (_, i) => file(`room-${i}.jpg`, 'image/jpeg', 2000000)), adapterFor(), 10);
      expect(result.ok).toBe(true); if (result.ok) batches.push(...result.photos);
    }
    expect(batches).toHaveLength(10);
    expect(batches.reduce((total, p) => total + p.optimizedBytes, 0)).toBeLessThanOrEqual(SAFE_ESTIMATE_REQUEST_BODY_LIMIT_BYTES);
    expect((await optimizePhotoSelection([file('bad.jpg', 'image/jpeg', 20)], adapterFor(), 11)).ok).toBe(false);
  });
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
      error: 'Photos must be JPEG, PNG, WebP, HEIC, or HEIF images.'
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

  it('optimizes ten photos within the unchanged combined budget', async () => {
    const result = await optimizePhotoSelection(Array.from({ length: 10 }, (_, index) => file(`p${index}.jpg`, 'image/jpeg', 1024)), adapterFor());
    expect(result.ok).toBe(true);
    if (result.ok) { expect(result.photos).toHaveLength(10); expect(result.totalBytes).toBeLessThanOrEqual(SAFE_ESTIMATE_REQUEST_BODY_LIMIT_BYTES); }
    expect(SAFE_ESTIMATE_REQUEST_BODY_LIMIT_BYTES).toBe(Math.floor(3.5 * 1024 * 1024));
  });

  it('rejects ten photos that cannot fit without weakening quality floors', async () => {
    const result = await optimizePhotoSelection(Array.from({ length: 10 }, (_, index) => file(`p${index}.jpg`, 'image/jpeg', 1024)), adapterFor({ minimumEncodedBytes: 500 * 1024 }));
    expect(result.ok).toBe(false);
  });

  it('rejects more than ten selected photos before optimization work', async () => {
    const result = await optimizePhotoSelection(Array.from({ length: 11 }, (_, index) => file(`p${index}.jpg`, 'image/jpeg', 1024)), adapterFor());

    expect(result).toEqual({ ok: false, error: 'Upload no more than 10 photos.' });
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

vi.mock('heic-to/csp', () => ({ heicTo: vi.fn() }));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Photo Library decoding', () => {
  it('accepts HEIF and empty/octet-stream MIME types from known library extensions without weakening decoding', async () => {
    for (const [name, type] of [['portrait.HEIC', ''], ['portrait.heif', 'application/octet-stream'], ['portrait.JPG', '']]) {
      const result = await optimizePhotoSelection([file(name, type, 1024)], adapterFor());
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.photos[0].file.type).toBe('image/jpeg');
    }
    expect(PHOTO_INPUT_ACCEPT).toContain('.heic'); expect(PHOTO_INPUT_ACCEPT).toContain('.heif');
    expect((await optimizePhotoSelection([file('file.bin', '', 1024)], adapterFor())).ok).toBe(false);
  });
  it('keeps small library exports at native size and handles encode errors recoverably', async () => {
    const result = await optimizePhotoSelection([file('small.jpg', 'image/jpeg', 1024)], adapterFor({ width: 600, height: 800 }));
    expect(result.ok).toBe(true);
    if (result.ok) { expect(result.photos[0].width).toBe(600); expect(result.photos[0].height).toBe(800); }
    expect(getOptimizationTargets(0, 0)).toEqual([]);
    const adapter = adapterFor(); adapter.encode = async () => { throw new Error('canvas unavailable'); };
    expect(await optimizePhotoSelection([file('photo.jpg', 'image/jpeg', 1024)], adapter)).toEqual({ ok: false, error: OPTIMIZATION_MESSAGES.failed });
  });
  function imageElement(fails = false) {
    vi.stubGlobal('Image', class {
      naturalWidth = 600; naturalHeight = 800;
      onload = () => {}; onerror = () => {};
      set src(value: string) { if (value) queueMicrotask(() => fails ? this.onerror() : this.onload()); }
    });
  }
  it('tries the orientation-aware image element when Safari ImageBitmap rejects the file', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('unsupported')));
    imageElement();
    const decoded = await browserPhotoOptimizerAdapter.decode(file('photo.heic', 'image/heic', 32));
    expect(decoded.width).toBe(600); expect(decoded.height).toBe(800); decoded.close?.();
    expect(createImageBitmap).toHaveBeenCalledWith(expect.any(Blob), { imageOrientation: 'from-image' });
  });
  it('uses the lazy local HEIC fallback only after both native paths fail and does not rotate decoded pixels twice', async () => {
    const { heicTo } = await import('heic-to/csp');
    const png = new Blob(['synthetic'], { type: 'image/png' });
    vi.mocked(heicTo).mockResolvedValue(png);
    const bitmap = { width: 600, height: 800, close: vi.fn() };
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValueOnce(new Error('unsupported')).mockResolvedValueOnce(bitmap));
    imageElement(true);
    const decoded = await browserPhotoOptimizerAdapter.decode(file('photo.HEIF', '', 32));
    expect(heicTo).toHaveBeenCalledWith({ blob: expect.any(File), type: 'image/png' });
    expect(createImageBitmap).toHaveBeenLastCalledWith(png, { imageOrientation: 'from-image' });
    expect(decoded.width).toBe(600); expect(decoded.height).toBe(800); decoded.close?.();
    expect(bitmap.close).toHaveBeenCalledOnce();
  });
  it('returns a recoverable HEIC message when both native decoding and conversion fail', async () => {
    const { heicTo } = await import('heic-to/csp');
    vi.mocked(heicTo).mockRejectedValue(new Error('invalid HEIF'));
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('unsupported'))); imageElement(true);
    expect(await optimizePhotoSelection([file('photo.heic', 'image/heic', 32)])).toEqual({ ok: false, error: OPTIMIZATION_MESSAGES.unsupportedHeic });
  });
});
