import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export const WHS_SSO_EXCHANGE_PATH = '/api/integrations/whs/session';
export const AI_PRICER_SESSION_COOKIE = 'whs_ai_pricer_session';

const ASSERTION_ISSUER = 'wade-home-services';
const ASSERTION_AUDIENCE = 'whs-ai-pricer';
const ASSERTION_SUBJECT = 'owner';
const ASSERTION_MAX_LIFETIME_SECONDS = 60;
const SESSION_LIFETIME_SECONDS = 30 * 60;
const CLOCK_SKEW_SECONDS = 10;

type AssertionClaims = {
  v: number;
  iss: string;
  aud: string;
  sub: string;
  iat: number;
  exp: number;
  jti: string;
};

type SessionClaims = {
  v: number;
  sub: string;
  iat: number;
  exp: number;
  jti: string;
};

export function verifyWadeHomeServicesAssertion(assertion: string | null, now = Date.now()) {
  const secret = process.env.AI_PRICER_SSO_SECRET;
  if (!secret || !assertion) return false;

  const [payload, signature, extra] = assertion.split('.');
  if (!payload || !signature || extra) return false;
  if (!signatureMatches(sign('whs-ai-pricer-assertion', payload, secret), signature)) return false;

  const claims = decodeClaims<AssertionClaims>(payload);
  if (!claims) return false;
  const nowSeconds = Math.floor(now / 1000);
  return (
    claims.v === 1 &&
    claims.iss === ASSERTION_ISSUER &&
    claims.aud === ASSERTION_AUDIENCE &&
    claims.sub === ASSERTION_SUBJECT &&
    validIdentifier(claims.jti) &&
    validTimes(claims.iat, claims.exp, nowSeconds, ASSERTION_MAX_LIFETIME_SECONDS)
  );
}

export function createAiPricerSession(now = Date.now()) {
  const secret = process.env.AI_PRICER_SSO_SECRET;
  if (!secret) throw new Error('AI_PRICER_SSO_SECRET is not configured.');

  const issuedAt = Math.floor(now / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      v: 1,
      sub: ASSERTION_SUBJECT,
      iat: issuedAt,
      exp: issuedAt + SESSION_LIFETIME_SECONDS,
      jti: randomUUID()
    } satisfies SessionClaims)
  ).toString('base64url');
  return `${payload}.${sign('whs-ai-pricer-session', payload, secret)}`;
}

export function isValidAiPricerSession(session: string | null | undefined, now = Date.now()) {
  const secret = process.env.AI_PRICER_SSO_SECRET;
  if (!secret || !session) return false;

  const [payload, signature, extra] = session.split('.');
  if (!payload || !signature || extra) return false;
  if (!signatureMatches(sign('whs-ai-pricer-session', payload, secret), signature)) return false;

  const claims = decodeClaims<SessionClaims>(payload);
  if (!claims) return false;
  const nowSeconds = Math.floor(now / 1000);
  return (
    claims.v === 1 &&
    claims.sub === ASSERTION_SUBJECT &&
    validIdentifier(claims.jti) &&
    validTimes(claims.iat, claims.exp, nowSeconds, SESSION_LIFETIME_SECONDS)
  );
}

export function aiPricerSessionCookieOptions() {
  return {
    httpOnly: true,
    maxAge: SESSION_LIFETIME_SECONDS,
    path: '/',
    sameSite: 'lax' as const,
    secure: true
  };
}

function validTimes(issuedAt: number, expiresAt: number, now: number, maximumLifetime: number) {
  if (!Number.isInteger(issuedAt) || !Number.isInteger(expiresAt)) return false;
  if (issuedAt > now + CLOCK_SKEW_SECONDS) return false;
  if (expiresAt < now - CLOCK_SKEW_SECONDS) return false;
  return expiresAt > issuedAt && expiresAt - issuedAt <= maximumLifetime;
}

function validIdentifier(value: string) {
  return typeof value === 'string' && value.length >= 16 && value.length <= 128;
}

function decodeClaims<T>(payload: string): T | null {
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}

function sign(context: string, payload: string, secret: string) {
  return createHmac('sha256', secret).update(`${context}.${payload}`).digest('base64url');
}

function signatureMatches(expected: string, supplied: string) {
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length && timingSafeEqual(expectedBuffer, suppliedBuffer);
}
