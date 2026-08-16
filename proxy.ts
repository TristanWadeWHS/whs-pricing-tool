import { NextRequest, NextResponse } from 'next/server';

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
  if (!suppliedToken || !constantTimeEquals(suppliedToken, configuredToken)) {
    return protectedResponse('Unauthorized', 401, true);
  }

  const response = NextResponse.next();
  response.headers.set('cache-control', 'no-store');
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
