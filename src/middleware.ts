// src/middleware.ts
import { NextRequest, NextResponse } from 'next/server';

/**
 * Supabase auth cookie name uses your project ref:
 * https://zdwenjdspvbfouooqlco.supabase.co
 */
const SB_AUTH_COOKIE = 'sb-zdwenjdspvbfouooqlco-auth-token';

function hasSessionCookie(req: NextRequest) {
  return (
    Boolean(req.cookies.get(SB_AUTH_COOKIE)) ||
    req.cookies.getAll().some(c => c.name.startsWith(SB_AUTH_COOKIE))
  );
}

/**
 * We ONLY protect these routes:
 * - /inventory/*
 * - /recipes/*
 * - /menu (builder)
 * - /menu/prep
 *
 * Everything else (/, /login, /share/*, /app/share/*, static, etc.) is public.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const protectedPaths = [
    /^\/inventory(\/.*)?$/i,
    /^\/recipes(\/.*)?$/i,
    /^\/menu$/i,
    /^\/menu\/prep$/i,
  ];

  const isProtected = protectedPaths.some(rx => rx.test(pathname));

  if (!isProtected) {
    // never touch public pages
    return NextResponse.next();
  }

  // protected: require a Supabase session cookie
  if (!hasSessionCookie(req)) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

/**
 * Matcher: run only on the handful of paths above.
 * (Reduces surprise and avoids intercepting public routes.)
 */
export const config = {
  matcher: [
    '/inventory/:path*',
    '/recipes/:path*',
    '/menu',
    '/menu/prep',
  ],
};
