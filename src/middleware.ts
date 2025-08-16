// src/middleware.ts
import { NextRequest, NextResponse } from 'next/server';

/**
 * Your Supabase project sets a cookie for server-side helpers in some flows,
 * but the browser SDK uses localStorage. We accept either the Supabase
 * cookie (if present) or our tiny kb_auth cookie that AuthGate writes.
 */
const SB_AUTH_COOKIE = 'sb-zdwenjdspvbfouooqlco-auth-token';
const KB_AUTH_COOKIE = 'kb_auth';

function hasSessionCookie(req: NextRequest) {
  const hasKb = req.cookies.get(KB_AUTH_COOKIE)?.value === '1';
  const hasSb =
    Boolean(req.cookies.get(SB_AUTH_COOKIE)) ||
    req.cookies.getAll().some((c) => c.name.startsWith(SB_AUTH_COOKIE));
  return hasKb || hasSb;
}

/**
 * Protect only these routes. Everything else is public.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const protectedPaths = [
    /^\/inventory(\/.*)?$/i,
    /^\/recipes(\/.*)?$/i,
    /^\/menu$/i,
    /^\/menu\/prep$/i,
  ];

  const isProtected = protectedPaths.some((rx) => rx.test(pathname));
  if (!isProtected) return NextResponse.next();

  if (!hasSessionCookie(req)) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/inventory/:path*', '/recipes/:path*', '/menu', '/menu/prep'],
};
