import { describe, expect, it } from 'vitest';
import { matchesImageSignature, validateEstimateForm } from '../app/lib/request-validation';
import { jpegFile, makeForm, pngBytes, pngFile, webpFile } from './helpers';

describe('estimate request validation', () => {
  it('accepts valid JPEG, PNG, and WebP images', async () => {
    await expect(validateEstimateForm(makeForm({}, [pngFile()]))).resolves.toMatchObject({ ok: true });
    await expect(validateEstimateForm(makeForm({}, [jpegFile()]))).resolves.toMatchObject({ ok: true });
    await expect(validateEstimateForm(makeForm({}, [webpFile()]))).resolves.toMatchObject({ ok: true });
  });

  it('rejects too many files, empty files, oversized files, and unsupported MIME types', async () => {
    await expect(validateEstimateForm(makeForm({}, Array.from({ length: 6 }, (_, i) => pngFile(`p${i}.png`))))).resolves.toMatchObject({ ok: false });
    await expect(validateEstimateForm(makeForm({}, [new File([new Uint8Array()], 'empty.png', { type: 'image/png' })]))).resolves.toMatchObject({ ok: false });
    await expect(validateEstimateForm(makeForm({}, [pngFile('large.png', new Uint8Array(9 * 1024 * 1024))]))).resolves.toMatchObject({ ok: false });
    await expect(validateEstimateForm(makeForm({}, [new File([pngBytes()], 'x.gif', { type: 'image/gif' })]))).resolves.toMatchObject({ ok: false });
  });

  it('rejects mismatched signatures and malformed selection fields', async () => {
    await expect(validateEstimateForm(makeForm({}, [new File([pngBytes()], 'fake.jpg', { type: 'image/jpeg' })]))).resolves.toMatchObject({ ok: false });
    await expect(validateEstimateForm(makeForm({ workers: 0 }))).resolves.toMatchObject({ ok: false });
    await expect(validateEstimateForm(makeForm({ distanceTier: 'far' }))).resolves.toMatchObject({ ok: false });
    await expect(validateEstimateForm(makeForm({ jobType: 'unknown' }))).resolves.toMatchObject({ ok: false });
    await expect(validateEstimateForm(makeForm({ carryDistance: 'sideways' }))).resolves.toMatchObject({ ok: false });
    await expect(validateEstimateForm(makeForm({ stairs: 'many' }))).resolves.toMatchObject({ ok: false });
    await expect(validateEstimateForm(makeForm({ notes: 'x'.repeat(1001) }))).resolves.toMatchObject({ ok: false });
  });

  it('detects image signatures directly', () => {
    expect(matchesImageSignature(pngBytes(), 'image/png')).toBe(true);
    expect(matchesImageSignature(pngBytes(), 'image/jpeg')).toBe(false);
  });
});

