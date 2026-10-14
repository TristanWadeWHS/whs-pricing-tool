import 'server-only';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { INTERNAL_SESSION_COOKIE, validInternalSession } from './internal-session';
import { getVercelOidcTokenSync } from '@vercel/oidc';

export const VISITOR_COOKIE = '__Host-whs-estimate-visitor';
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const LIMIT_MESSAGE = 'Looks like you have several projects in mind! Please contact our team so we can help with additional estimates.';
export const CONTACT_LINK = 'tel:+19494245605'; // Existing WHS website main page.
export function historyEnabled() { return process.env.PRICER_HISTORY_ENABLED === 'true'; }
export function publicEnabled() { return process.env.PRICER_PUBLIC_CUSTOMERS_ENABLED === 'true'; }
export function allowanceEnabled() {
  return process.env.PRICER_DAILY_LIMIT_ENABLED === 'true' || (process.env.VERCEL_ENV === 'production' && publicEnabled());
}
export function boundedSetting(name: string, fallback: number, max: number) {
  const n = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(n) || n < 1 || n > max) throw new Error('Invalid estimate configuration.');
  return n;
}
export function historyConfigured() {
  // Configuration presence is not an access check. SDK calls still authorize every operation.
  // Functions receive OIDC in trusted request context; builds may use the env fallback.
  let oidc=false;try {oidc=!!getVercelOidcTokenSync();}catch { /* No SDK identity available. */ }
  const blobCredentials=!!process.env.BLOB_READ_WRITE_TOKEN || (!!process.env.BLOB_STORE_ID && oidc);
  return historyEnabled() && !!process.env.PRICER_DATABASE_URL && (process.env.PRICER_VISITOR_SECRET?.length ?? 0)>=32
    && blobCredentials && process.env.PRICER_BLOB_PRIVATE_CONFIRMED === 'true';
}
export function cookieValue(req: Request, name: string) {
  return req.headers.get('cookie')?.split(';').map((s) => s.trim()).find((s) => s.startsWith(`${name}=`))?.slice(name.length + 1);
}
function equal(a: string, b: string) { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x,y); }
export function verifiedStaff(req: Request) {
  // The shared internal credential must first be confirmed staff-only by the owner.
  if (process.env.PRICER_INTERNAL_AUTH_IS_STAFF !== 'true') return false;
  const key = process.env.INTERNAL_ACCESS_TOKEN; if (!key) return false;
  const host = req.headers.get('host') || new URL(req.url).host;
  if (validInternalSession(cookieValue(req, INTERNAL_SESSION_COOKIE), key, host)) return true;
  let supplied = req.headers.get('x-internal-access-token') ?? '';
  const auth = req.headers.get('authorization') ?? '';
  if (/^Bearer /i.test(auth)) supplied = auth.slice(7);
  if (/^Basic /i.test(auth)) { const raw = Buffer.from(auth.slice(6), 'base64').toString(); supplied = raw.slice(raw.indexOf(':') + 1); }
  return !!supplied && equal(supplied, key);
}
function visitorMac(id: string) {
  const key = process.env.PRICER_VISITOR_SECRET;
  if (!key || key.length < 32) throw new Error('Visitor configuration unavailable.');
  return createHmac('sha256',key).update(`whs-visitor-v1:${id}`).digest('base64url');
}
export function visitor(req: Request) {
  const value = cookieValue(req, VISITOR_COOKIE) ?? '', [id,mac] = value.split('.');
  return UUID.test(id ?? '') && mac && equal(mac, visitorMac(id)) ? id : null;
}
export function newVisitorCookie() {
  const id=randomUUID(); return { id, value: `${id}.${visitorMac(id)}` };
}
export function requireSameOrigin(req: Request) {
  const origin = new URL(req.url).origin;
  if (req.headers.get('origin') !== origin || req.headers.get('sec-fetch-site') === 'cross-site') throw new Error('Cross-origin request rejected.');
}
export async function smallJson(req: Request, limit=16_384) {
  const reader=req.body?.getReader(); if (!reader) throw new Error('Missing body.');
  let bytes=0; const chunks: Uint8Array[]=[];
  while(true) { const {done,value}=await reader.read(); if(done)break; bytes+=value.length; if(bytes>limit){await reader.cancel();throw new Error('Body too large.');} chunks.push(value); }
  return JSON.parse(Buffer.concat(chunks).toString());
}
