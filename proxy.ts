import { NextRequest, NextResponse } from 'next/server';
import { INTERNAL_SESSION_COOKIE, INTERNAL_SESSION_SECONDS, issueInternalSession, validInternalSession } from './app/lib/internal-session';

export function proxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  if (isPublicAsset(pathname)) {
    return NextResponse.next();
  }

  const configuredToken = process.env.INTERNAL_ACCESS_TOKEN;
  if (!configuredToken) {
    return protectedResponse('Internal access is not configured.', 503);
  }

  const suppliedToken = getSuppliedToken(req);
  // NextURL normalizes loopback IPs to localhost. Compare against the actual
  // request authority, not that normalized alias (and never X-Forwarded-Host).
  const host = req.headers.get('host') || req.nextUrl.host;
  const originForRequest = `${req.nextUrl.protocol}//${host}`;
  const headerAuthorized = !!suppliedToken && constantTimeEquals(suppliedToken, configuredToken);
  const sessionAuthorized = validInternalSession(req.cookies.get(INTERNAL_SESSION_COOKIE)?.value, configuredToken, host);
  if (!headerAuthorized && !sessionAuthorized) {
    // A background API 401 must not open another native Basic-auth dialog.
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Sign-in is required. Sign in to this same site in another tab, then retry here. Your unsent entries stay in this tab.' }, {
        status: 401, headers: { 'cache-control': 'no-store' }
      });
    }
    return protectedResponse('Unauthorized', 401, true);
  }

  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const origin = req.headers.get('origin');
    if ((origin !== null && origin !== originForRequest) || (!headerAuthorized && origin !== originForRequest)
      || req.headers.get('sec-fetch-site') === 'cross-site') {
      return protectedResponse('Cross-origin request rejected.', 403);
    }
  }

  const response = NextResponse.next();
  response.headers.set('cache-control', 'no-store');
  if (headerAuthorized && !sessionAuthorized) {
    response.cookies.set(INTERNAL_SESSION_COOKIE, issueInternalSession(configuredToken, host), {
      httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: INTERNAL_SESSION_SECONDS
    });
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|winston-logo.png).*)']
};

function isPublicAsset(pathname: string) {
  return pathname.startsWith('/_next/') || pathname === '/favicon.ico' || pathname === '/winston-logo.png';
}

function getSuppliedToken(req: NextRequest) {
  const directHeader = req.headers.get('x-internal-access-token');
  if (directHeader) {
    return directHeader;
  }

  const authorization = req.headers.get('authorization') || '';
  const bearerMatch = authorization.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch) {
    return bearerMatch[1];
  }

  const basicMatch = authorization.match(/^Basic\s+(.+)$/i);
  if (!basicMatch) {
    return undefined;
  }

  try {
    const decoded = atob(basicMatch[1]);
    const separator = decoded.indexOf(':');
    return separator >= 0 ? decoded.slice(separator + 1) : decoded;
  } catch {
    return undefined;
  }
}

function constantTimeEquals(a: string, b: string) {
  if (a.length !== b.length) {
    return false;
  }

  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }

  return difference === 0;
}

function protectedResponse(body: string, status: number, challenge = false) {
  const headers = new Headers({
    'cache-control': 'no-store',
    'content-type': 'text/plain; charset=utf-8'
  });

  if (challenge) {
    headers.set('www-authenticate', 'Basic realm="WHS Internal Pricing Tool", charset="UTF-8"');
  }

  return new NextResponse(body, { status, headers });
}
