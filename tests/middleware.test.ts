import { describe, expect, it, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '../proxy';
import {
  AI_PRICER_SESSION_COOKIE,
  createAiPricerSession,
  WHS_SSO_EXCHANGE_PATH
} from '../app/lib/whs-sso';

const originalToken = process.env.INTERNAL_ACCESS_TOKEN;
const originalSsoSecret = process.env.AI_PRICER_SSO_SECRET;

afterEach(() => {
  process.env.INTERNAL_ACCESS_TOKEN = originalToken;
  if (originalSsoSecret === undefined) delete process.env.AI_PRICER_SSO_SECRET;
  else process.env.AI_PRICER_SSO_SECRET = originalSsoSecret;
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

  it('allows only POST requests to reach the signed WHS session exchange', () => {
    delete process.env.INTERNAL_ACCESS_TOKEN;
    const postResponse = proxy(
      new NextRequest(`https://example.test${WHS_SSO_EXCHANGE_PATH}`, { method: 'POST' })
    );
    const getResponse = proxy(new NextRequest(`https://example.test${WHS_SSO_EXCHANGE_PATH}`));

    expect(postResponse.status).toBe(200);
    expect(getResponse.status).toBe(503);
  });

  it('accepts a valid HttpOnly portal session without weakening the standalone gate', () => {
    delete process.env.INTERNAL_ACCESS_TOKEN;
    process.env.AI_PRICER_SSO_SECRET = 'test-sso-secret';
    const session = createAiPricerSession();
    const response = proxy(
      new NextRequest('https://example.test/api/analyze', {
        headers: { cookie: `${AI_PRICER_SESSION_COOKIE}=${session}` }
      })
    );

    expect(response.status).toBe(200);
  });
});
