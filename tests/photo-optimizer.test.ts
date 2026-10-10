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
  photoFailureMessage,
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
  it('tries the exact dimension floor once for portrait, landscape and small images', () => {
    for (const [width, height] of [[3024, 4032], [4032, 3024], [1000, 1400], [960, 1280], [600, 800]]) {
      const targets = getOptimizationTargets(width, height);
      const floor = Math.min(Math.max(width, height), 1280);
      const sizes = [...new Set(targets.map((t) => Math.max(t.width, t.height)))];
      expect(sizes.at(-1)).toBe(floor);
      expect(sizes.every((n) => n >= floor)).toBe(true);
      expect(targets.filter((t) => Math.max(t.width, t.height) === floor).map((t) => t.quality)).toEqual([0.84, 0.8, 0.76, 0.72, 0.68]);
      expect(targets.length).toBeLessThanOrEqual(20);
    }
  });
  it('tries the existing floor when the actual batch exceeds its aggregate allowance', async () => {
    const adapter = adapterFor({ width: 3024, height: 4032 });
    // Synthetic encoder fixture, not a claim about the user's original pixels.
    adapter.encode = async (_image, t) => new Blob([new Uint8Array(t.height === 1280 && t.quality === 0.68 ? 323000 : 431120)], { type: 'image/jpeg' });
    const result = await optimizePhotoSelection(Array.from({ length: 10 }, () => file('synthetic.jpg', 'image/jpeg', 3807149)), adapter);
    expect(result.ok).toBe(true);
    const photos = result.ok ? result.photos : [];
    expect(photos).toHaveLength(10);
    expect(photos.every((p) => p.width === 960 && p.height === 1280 && p.quality === 0.68)).toBe(true);
    expect(photos.reduce((n, p) => n + p.optimizedBytes, 0)).toBeLessThanOrEqual(SAFE_ESTIMATE_REQUEST_BODY_LIMIT_BYTES);
    expect(getProcessedImageBudget(10)).toBe(367001);
  });
  it('accounts for retained bytes across ten photos in separate batches without recompressing prior photos', async () => {
    const batches = [];
    for (const count of [3, 7]) {
      const result = await optimizePhotoSelection(Array.from({ length: count }, (_, i) => file(`room-${i}.jpg`, 'image/jpeg', 2000000)), adapterFor(), { count: batches.length, bytes: batches.reduce((n, p) => n + p.file.size, 0) });
      expect(result.ok).toBe(true); if (result.ok) batches.push(...result.photos);
    }
    expect(batches).toHaveLength(10);
    expect(batches.reduce((total, p) => total + p.optimizedBytes, 0)).toBeLessThanOrEqual(SAFE_ESTIMATE_REQUEST_BODY_LIMIT_BYTES);
    expect((await optimizePhotoSelection([file('bad.jpg', 'image/jpeg', 20)], adapterFor(), { count: 10, bytes: 100 })).ok).toBe(false);
  });
  it('accepts six reported 406947-byte outputs, not an arbitrary ten-slot share', async () => {
    const result = await optimizePhotoSelection(Array.from({ length: 6 }, (_, i) => file(`p${i}.jpg`, 'image/jpeg', 4044394)), adapterFor({ minimumEncodedBytes: 406947, compressionDivisor: 100 }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.totalBytes).toBe(2441682);
      expect(result.photos.map((p) => p.file.name)).toEqual(['p0.jpg', 'p1.jpg', 'p2.jpg', 'p3.jpg', 'p4.jpg', 'p5.jpg']);
    }
    expect(getProcessedImageBudget(6)).toBe(611669);
  });
  it('accepts uneven outputs above equal shares when their combined size fits', async () => {
    const adapter = adapterFor();
    adapter.decode = async (input) => ({ width: 3024, height: 4032, source: { bytes: input.name === 'large.jpg' ? 900000 : 200000 } as unknown as CanvasImageSource });
    adapter.encode = async (image) => new Blob([new Uint8Array((image.source as unknown as { bytes: number }).bytes)], { type: 'image/jpeg' });
    const inputs = ['large.jpg', 'b.jpg', 'c.jpg', 'd.jpg', 'e.jpg', 'f.jpg'].map((name) => file(name, 'image/jpeg', 1000));
    const result = await optimizePhotoSelection(inputs, adapter);
    expect(result.ok).toBe(true);
    if (result.ok) { expect(result.totalBytes).toBe(1900000); expect(result.photos[0].optimizedBytes).toBe(900000); }
  });
  it('rejects a genuinely over-budget batch without mutating retained files and permits a smaller retry', async () => {
    const retained = { count: 4, bytes: 3000000 };
    const adapter = adapterFor({ minimumEncodedBytes: 406947, compressionDivisor: 100 });
    const photo = file('synthetic.jpg', 'image/jpeg', 4044394);
    expect(await optimizePhotoSelection([photo, photo], adapter, retained)).toEqual({ ok: false, error: OPTIMIZATION_MESSAGES.batchTooLarge });
    const retry = await optimizePhotoSelection([photo], adapter, retained);
    expect(retry.ok).toBe(true);
    expect(retained).toEqual({ count: 4, bytes: 3000000 });
    expect(getProcessedImageBudget(2, SAFE_ESTIMATE_REQUEST_BODY_LIMIT_BYTES - retained.bytes)).toBe(335008);
  });
  it('reclaims unused compression potential instead of enforcing equal shares on the final pass', async () => {
    const adapter = adapterFor();
    adapter.decode = async (input) => ({ width: 3024, height: 4032, source: { fixed: input.name === 'fixed.jpg' } as unknown as CanvasImageSource });
    adapter.encode = async (image, target) => new Blob([new Uint8Array((image.source as unknown as { fixed: boolean }).fixed ? 600000 : target.height === 1280 ? 200000 : 500000)], { type: 'image/jpeg' });
    const result = await optimizePhotoSelection(['fixed.jpg', 'compressible.jpg'].map((name) => file(name, 'image/jpeg', 1000)), adapter,
      { count: 2, bytes: SAFE_ESTIMATE_REQUEST_BODY_LIMIT_BYTES - 1000000 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.photos.map((p) => p.optimizedBytes)).toEqual([600000, 200000]);
  });
  it('rejects invalid retained capacity and exhausts no decoder work with zero space', async () => {
    const adapter = adapterFor(); const decode = vi.spyOn(adapter, 'decode');
    const photo = file('test.jpg', 'image/jpeg', 1000);
    for (const retained of [{ count: -1, bytes: 0 }, { count: 0, bytes: -1 }, { count: 0, bytes: NaN }, { count: 0, bytes: SAFE_ESTIMATE_REQUEST_BODY_LIMIT_BYTES + 1 }]) {
      expect((await optimizePhotoSelection([photo], adapter, retained)).ok).toBe(false);
    }
    expect(await optimizePhotoSelection([photo], adapter, { count: 2, bytes: SAFE_ESTIMATE_REQUEST_BODY_LIMIT_BYTES })).toEqual({ ok: false, error: OPTIMIZATION_MESSAGES.batchTooLarge });
    expect(decode).not.toHaveBeenCalled();
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

    expect(result).toMatchObject({ ok: false, error: OPTIMIZATION_MESSAGES.failed, diagnostic: { stage: 'processed-budget' } });
  });

  it('reports unsupported formats and unsupported HEIC decode separately', async () => {
    await expect(optimizePhotoSelection([file('scan.gif', 'image/gif', 1024)], adapterFor())).resolves.toEqual({
      ok: false,
      error: 'Photos must be JPEG, PNG, WebP, HEIC, or HEIF images.'
    });

    await expect(optimizePhotoSelection([file('photo.heic', 'image/heic', 4 * 1024 * 1024)], adapterFor({ failDecodeFor: ['image/heic'] }))).resolves.toMatchObject({
      ok: false,
      error: OPTIMIZATION_MESSAGES.unsupportedHeic
    });
  });

  it('rejects unreasonably large original files before decode work', async () => {
    const result = await optimizePhotoSelection([file('too-large.jpg', 'image/jpeg', PHOTO_OPTIMIZATION_LIMITS.maxOriginalBytes + 1)], adapterFor());

    expect(result).toMatchObject({ ok: false, error: OPTIMIZATION_MESSAGES.failed, diagnostic: { stage: 'input-byte-limit' } });
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
    expect(await optimizePhotoSelection([file('photo.jpg', 'image/jpeg', 1024)], adapter)).toMatchObject({ ok: false, error: OPTIMIZATION_MESSAGES.failed, diagnostic: { stage: 'encode-exception' } });
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
    expect(await optimizePhotoSelection([file('photo.heic', 'image/heic', 32)])).toMatchObject({ ok: false, error: OPTIMIZATION_MESSAGES.unsupportedHeic, diagnostic: { stage: 'decode' } });
  });
  it('distinguishes local failure stages without filenames, raw exceptions or photo contents', async () => {
    const source = file('synthetic-private-marker.jpg', 'image/jpeg', 1234);
    const failing = adapterFor(); failing.encode = async () => { throw new DOMException('synthetic-private-marker', 'SecurityError'); };
    const cases: [PhotoOptimizerAdapter, string][] = [
      [adapterFor({ failDecodeFor: ['image/jpeg'] }), 'decode'],
      [adapterFor({ width: 0, height: 0 }), 'dimensions'],
      [{ ...adapterFor(), encode: async () => null }, 'encode-empty'],
      [{ ...adapterFor(), encode: async () => new Blob([]) }, 'encode-empty'],
      [failing, 'encode-exception'],
      [adapterFor({ minimumEncodedBytes: MAX_ESTIMATE_IMAGE_BYTES + 1 }), 'processed-budget']
    ];
    for (const [adapter, stage] of cases) {
      const result = await optimizePhotoSelection([source], adapter);
      expect(result.ok).toBe(false); if (result.ok !== false) continue;
      expect(result.diagnostic?.stage).toBe(stage);
      expect(result.diagnostic?.originalBytes).toBe(1234);
      expect(result.diagnostic?.budgetBytes).toBe(getProcessedImageBudget(1));
      expect(photoFailureMessage(result)).toContain('Not uploaded.');
      expect(photoFailureMessage(result)).not.toContain('synthetic-private-marker');
    }
    expect(await optimizePhotoSelection([file('empty.jpg', 'image/jpeg', 0)], adapterFor())).toMatchObject({ ok: false, diagnostic: { stage: 'input-empty' } });
  });
});
