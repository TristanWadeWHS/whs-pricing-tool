import { describe, expect, it, afterEach, vi } from 'vitest';
vi.mock('server-only',()=>({}));
import { NextRequest } from 'next/server';
import { proxy } from '../proxy';
import { INTERNAL_SESSION_COOKIE, INTERNAL_SESSION_SECONDS } from '../app/lib/internal-session';

const originalToken = process.env.INTERNAL_ACCESS_TOKEN;

afterEach(() => {
  if (originalToken === undefined) delete process.env.INTERNAL_ACCESS_TOKEN;
  else process.env.INTERNAL_ACCESS_TOKEN = originalToken;
  vi.useRealTimers();
});

describe('temporary internal access middleware', () => {
  it('fails closed when access token configuration is missing', () => {
    delete process.env.INTERNAL_ACCESS_TOKEN;
    const response = proxy(new NextRequest('https://example.test/'));
    expect(response.status).toBe(503);
  });

  it('rejects unauthenticated requests', () => {
    process.env.INTERNAL_ACCESS_TOKEN = 'test-token';
    const response = proxy(new NextRequest('https://example.test/'));
    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toContain('Basic');
  });

  it('allows requests with the internal access header', () => {
    process.env.INTERNAL_ACCESS_TOKEN = 'test-token';
    const request = new NextRequest('https://example.test/', {
      headers: { 'x-internal-access-token': 'test-token' }
    });
    const response = proxy(request);
    expect(response.status).toBe(200);
  });

  it('allows requests with browser basic authentication', () => {
    process.env.INTERNAL_ACCESS_TOKEN = 'test-token';
    const credentials = btoa('employee:test-token');
    const request = new NextRequest('https://example.test/', {
      headers: { authorization: `Basic ${credentials}` }
    });
    const response = proxy(request);
    expect(response.status).toBe(200);
  });

  it('allows API requests with bearer authentication', () => {
    process.env.INTERNAL_ACCESS_TOKEN = 'test-token';
    const request = new NextRequest('https://example.test/api/analyze', {
      headers: { authorization: 'Bearer test-token' }
    });
    const response = proxy(request);
    expect(response.status).toBe(200);
  });

  it('does not accept URL query-string tokens', () => {
    process.env.INTERNAL_ACCESS_TOKEN = 'test-token';
    const response = proxy(new NextRequest('https://example.test/?access_token=test-token'));
    expect(response.status).toBe(401);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  function login() {
    process.env.INTERNAL_ACCESS_TOKEN = 'test-token';
    return proxy(new NextRequest('https://example.test/', { headers: { authorization: `Basic ${btoa('employee:test-token')}` } }));
  }
  function cookie() {
    return `${INTERNAL_SESSION_COOKIE}=${login().cookies.get(INTERNAL_SESSION_COOKIE)!.value}`;
  }
  it('issues a secure host-only HttpOnly session after successful login, without storing the credential', () => {
    const response = login(), header = response.headers.get('set-cookie')!;
    for (const attribute of ['HttpOnly', 'Secure', 'SameSite=lax', 'Path=/', `Max-Age=${INTERNAL_SESSION_SECONDS}`]) expect(header).toContain(attribute);
    expect(header).not.toContain('Domain='); expect(header).not.toContain('test-token');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('location')).toBeNull();
  });
  it('persists page and protected API access when Safari omits Basic credentials, without redirects or session extension', () => {
    const value = cookie();
    for (const path of ['/', '/staff', '/api/estimate-location']) {
      const response = proxy(new NextRequest(`https://example.test${path}`, { headers: { cookie: value } }));
      expect(response.status).toBe(200); expect(response.headers.get('set-cookie')).toBeNull();
      expect(response.headers.get('www-authenticate')).toBeNull(); expect(response.headers.get('location')).toBeNull();
      expect(response.headers.get('cache-control')).toBe('no-store');
    }
    expect(proxy(new NextRequest('https://example.test/api/conversation', { method: 'POST', headers: { cookie: value, origin: 'https://example.test' } })).status).toBe(200);
  });
  it('rejects forged, expired, cross-host and secret-rotated sessions', () => {
    vi.useFakeTimers();
    const value = cookie();
    expect(proxy(new NextRequest('https://other.test/', { headers: { cookie: value } })).status).toBe(401);
    expect(proxy(new NextRequest('https://example.test/', { headers: { cookie: value + 'x' } })).status).toBe(401);
    process.env.INTERNAL_ACCESS_TOKEN = 'rotated';
    expect(proxy(new NextRequest('https://example.test/', { headers: { cookie: value } })).status).toBe(401);
    process.env.INTERNAL_ACCESS_TOKEN = 'test-token';
    vi.advanceTimersByTime(INTERNAL_SESSION_SECONDS * 1000);
    expect(proxy(new NextRequest('https://example.test/', { headers: { cookie: value } })).status).toBe(401);
  });
  it('compares cookie CSRF origin to the actual loopback host, never a forwarded alias', () => {
    process.env.INTERNAL_ACCESS_TOKEN = 'test-token';
    const headers = { host: '127.0.0.1:3017', authorization: `Basic ${btoa('staff:test-token')}` };
    const response = proxy(new NextRequest('http://127.0.0.1:3017/', { headers }));
    const cookie = `${INTERNAL_SESSION_COOKIE}=${response.cookies.get(INTERNAL_SESSION_COOKIE)!.value}`;
    expect(proxy(new NextRequest('http://127.0.0.1:3017/api/conversation', { method: 'POST', headers: { host: '127.0.0.1:3017', cookie, origin: 'http://127.0.0.1:3017' } })).status).toBe(200);
    expect(proxy(new NextRequest('http://127.0.0.1:3017/api/conversation', { method: 'POST', headers: { host: '127.0.0.1:3017', cookie, origin: 'https://evil.test', 'x-forwarded-host': 'evil.test' } })).status).toBe(403);
  });
  it('rejects cross-origin or missing-origin cookie mutations and does not challenge background API failures', () => {
    const value = cookie();
    for (const origin of [undefined, 'null', 'https://evil.test']) {
      const headers: Record<string, string> = { cookie: value }; if (origin) headers.origin = origin;
      expect(proxy(new NextRequest('https://example.test/api/conversation', { method: 'POST', headers })).status).toBe(403);
    }
    const response = proxy(new NextRequest('https://example.test/api/conversation', { method: 'POST' }));
    expect(response.status).toBe(401); expect(response.headers.get('www-authenticate')).toBeNull();
    expect(response.headers.get('set-cookie')).toBeNull(); expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it('does not issue sessions for incorrect credentials and still fails closed with a cookie but no configuration', () => {
    const value = cookie();
    expect(proxy(new NextRequest('https://example.test/', { headers: { authorization: `Basic ${btoa('employee:wrong')}` } })).headers.get('set-cookie')).toBeNull();
    delete process.env.INTERNAL_ACCESS_TOKEN;
    expect(proxy(new NextRequest('https://example.test/', { headers: { cookie: value } })).status).toBe(503);
  });
});
