import { NextRequest, NextResponse } from 'next/server';

const ACCESS_COOKIE = 'whs_internal_access';
const ACCESS_QUERY_PARAM = 'access_token';

export function proxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  if (isPublicAsset(pathname)) {
    return NextResponse.next();
  }

  const configuredToken = process.env.INTERNAL_ACCESS_TOKEN;
  if (!configuredToken) {
    return new NextResponse('Internal access is not configured.', { status: 503 });
  }

  const suppliedToken =
    req.headers.get('x-internal-access-token') ||
    req.cookies.get(ACCESS_COOKIE)?.value ||
    req.nextUrl.searchParams.get(ACCESS_QUERY_PARAM);

  if (suppliedToken !== configuredToken) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  if (req.nextUrl.searchParams.has(ACCESS_QUERY_PARAM)) {
    const cleanUrl = req.nextUrl.clone();
    cleanUrl.searchParams.delete(ACCESS_QUERY_PARAM);
    const response = NextResponse.redirect(cleanUrl);
    response.cookies.set(ACCESS_COOKIE, configuredToken, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/'
    });
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|winston-logo.png).*)']
};

function isPublicAsset(pathname: string) {
  return pathname.startsWith('/_next/') || pathname === '/favicon.ico' || pathname === '/winston-logo.png';
}

