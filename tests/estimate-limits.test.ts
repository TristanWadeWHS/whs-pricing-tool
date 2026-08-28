import { describe, expect, it } from 'vitest';
import {
  getPhotoSizeRejection,
  IMAGE_TOO_LARGE_MESSAGE,
  MAX_ESTIMATE_IMAGE_BYTES,
  SAFE_ESTIMATE_REQUEST_BODY_LIMIT_BYTES,
  totalFileBytes,
  VERCEL_FUNCTION_PAYLOAD_LIMIT_BYTES
} from '../app/lib/estimate-limits';

describe('estimate upload limits', () => {
  it('keeps the application upload budget below the Vercel function payload ceiling', () => {
    expect(SAFE_ESTIMATE_REQUEST_BODY_LIMIT_BYTES).toBeLessThan(VERCEL_FUNCTION_PAYLOAD_LIMIT_BYTES);
  });

  it('allows one realistic phone-size image with margin', () => {
    const realisticPhoneImage = { size: Math.floor(2.5 * 1024 * 1024) };
    expect(getPhotoSizeRejection([realisticPhoneImage])).toBeNull();
  });

  it('rejects oversized individual images before submission', () => {
    expect(getPhotoSizeRejection([{ size: MAX_ESTIMATE_IMAGE_BYTES + 1 }])).toBe('Each photo must be 3 MB or smaller.');
  });

  it('rejects combined image selections that can exceed the deployment request limit', () => {
    const files = [{ size: Math.floor(2.5 * 1024 * 1024) }, { size: Math.floor(2.5 * 1024 * 1024) }];
    expect(totalFileBytes(files)).toBeGreaterThan(VERCEL_FUNCTION_PAYLOAD_LIMIT_BYTES);
    expect(getPhotoSizeRejection(files)).toBe(IMAGE_TOO_LARGE_MESSAGE);
  });

  it('accounts for base64 expansion before images are sent to OpenAI', () => {
    const decodedBytes = 3 * 1024 * 1024;
    const encodedBytes = Buffer.from(new Uint8Array(decodedBytes)).toString('base64').length;
    expect(encodedBytes).toBe(Math.ceil(decodedBytes / 3) * 4);
    expect(encodedBytes).toBeGreaterThan(decodedBytes);
  });
});
