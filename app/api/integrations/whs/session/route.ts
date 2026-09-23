import { NextResponse } from 'next/server';
import {
  AI_PRICER_SESSION_COOKIE,
  aiPricerSessionCookieOptions,
  createAiPricerSession,
  verifyWadeHomeServicesAssertion
} from '../../../../lib/whs-sso';

export async function POST(request: Request) {
  let assertion: string | null = null;
  try {
    const form = await request.formData();
    const supplied = form.get('assertion');
    assertion = typeof supplied === 'string' ? supplied : null;
  } catch {
    return protectedError('Invalid authentication request.', 400);
  }

  if (!verifyWadeHomeServicesAssertion(assertion)) {
    return protectedError('Unauthorized.', 401);
  }

  const response = NextResponse.redirect(new URL('/', request.url), 303);
  response.cookies.set(AI_PRICER_SESSION_COOKIE, createAiPricerSession(), aiPricerSessionCookieOptions());
  response.headers.set('cache-control', 'no-store');
  response.headers.set('referrer-policy', 'no-referrer');
  return response;
}

function protectedError(message: string, status: number) {
  return NextResponse.json(
    { ok: false, message },
    {
      headers: {
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer'
      },
      status
    }
  );
}
