import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const INTERNAL_SESSION_COOKIE = '__Host-whs-internal-session';
export const INTERNAL_SESSION_SECONDS = 8 * 60 * 60;

function signature(payload: string, key: string, host: string) {
  return createHmac('sha256', key).update('whs-internal-session-v1\0').update(host).update('\0').update(payload).digest();
}

// Reuses the existing access secret, domain-separated from signed analysis context.
// The cookie contains only expiry, a nonce and a signature, never the credential.
export function issueInternalSession(key: string, host: string, now = Date.now()) {
  const payload = `${Math.floor(now / 1000) + INTERNAL_SESSION_SECONDS}.${randomBytes(16).toString('hex')}`;
  return `${payload}.${signature(payload, key, host).toString('base64url')}`;
}

export function validInternalSession(value: string | undefined, key: string, host: string, now = Date.now()) {
  if (!value || !/^\d{10}\.[a-f0-9]{32}\.[A-Za-z0-9_-]{43}$/.test(value)) return false;
  const [expiry, nonce, mac] = value.split('.');
  const remaining = Number(expiry) - Math.floor(now / 1000);
  if (remaining <= 0 || remaining > INTERNAL_SESSION_SECONDS) return false;
  const expected = signature(`${expiry}.${nonce}`, key, host);
  const actual = Buffer.from(mac, 'base64url');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
