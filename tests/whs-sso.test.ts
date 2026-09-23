import { createHmac, randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  aiPricerSessionCookieOptions,
  createAiPricerSession,
  isValidAiPricerSession,
  verifyWadeHomeServicesAssertion
} from '../app/lib/whs-sso';

const originalSecret = process.env.AI_PRICER_SSO_SECRET;

afterEach(() => {
  if (originalSecret === undefined) delete process.env.AI_PRICER_SSO_SECRET;
  else process.env.AI_PRICER_SSO_SECRET = originalSecret;
});

describe('WHS Owner Portal SSO', () => {
  it('accepts an unexpired owner assertion and rejects tampering or expiration', () => {
    process.env.AI_PRICER_SSO_SECRET = 'test-sso-secret';
    const now = 1_800_000_000_000;
    const assertion = createAssertion(now);

    expect(verifyWadeHomeServicesAssertion(assertion, now)).toBe(true);
    expect(verifyWadeHomeServicesAssertion(`${assertion}tampered`, now)).toBe(false);
    expect(verifyWadeHomeServicesAssertion(assertion, now + 120_000)).toBe(false);
  });

  it('creates a short-lived signed HttpOnly session cookie', () => {
    process.env.AI_PRICER_SSO_SECRET = 'test-sso-secret';
    const now = 1_800_000_000_000;
    const session = createAiPricerSession(now);
    const options = aiPricerSessionCookieOptions();

    expect(isValidAiPricerSession(session, now)).toBe(true);
    expect(isValidAiPricerSession(session, now + 31 * 60_000)).toBe(false);
    expect(options.httpOnly).toBe(true);
    expect(options.secure).toBe(true);
    expect(options.sameSite).toBe('lax');
    expect(options.maxAge).toBe(30 * 60);
  });
});

function createAssertion(now: number) {
  const issuedAt = Math.floor(now / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      v: 1,
      iss: 'wade-home-services',
      aud: 'whs-ai-pricer',
      sub: 'owner',
      iat: issuedAt,
      exp: issuedAt + 60,
      jti: randomUUID()
    })
  ).toString('base64url');
  const signature = createHmac('sha256', process.env.AI_PRICER_SSO_SECRET!)
    .update(`whs-ai-pricer-assertion.${payload}`)
    .digest('base64url');
  return `${payload}.${signature}`;
}
