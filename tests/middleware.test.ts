import { describe, expect, it, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '../proxy';

const originalToken = process.env.INTERNAL_ACCESS_TOKEN;

afterEach(() => {
  process.env.INTERNAL_ACCESS_TOKEN = originalToken;
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
});
