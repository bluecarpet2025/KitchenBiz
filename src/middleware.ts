// src/middleware.ts
import { NextRequest, NextResponse } from 'next/server';

/**
 * Public routes = allowed without auth
 * Keep "/" public so magic-link hash can be processed by the login page.
 */
const PUBLIC_PATHS = ['/', '/login'];

/**
 * Supabase auth cookie name uses your project ref.
 * Your Supabase URL is https://zdwenjdspvbfouooqlco.supabase.co
 * -> cookie prefix = sb-zdwenjdspvbfouooqlco-auth-token
 */
const SB_AUTH_COOKIE = 'sb-zdwenjdspvbfouooqlco-auth-token';

function isPublicPath(pathname: string) {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  // Always allow Next.js assets & typical static files
  if (pathname.startsWith('/_next')) return true;
  if (pathname === '/favicon.ico') return true;
  if (/\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt)$/.test(pathname)) return true;
  return false;
}

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // Public & static always pass
  if (isPublicPath(pathname)) return NextResponse.next();

  // Consider user "signed in" if the Supabase auth cookie is present
  const hasSession =
    Boolean(req.cookies.get(SB_AUTH_COOKIE)) ||
    req.cookies.getAll().some((c) => c.name.startsWith(SB_AUTH_COOKIE));

  // If not signed in, bounce to /login and remember where they were going
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', pathname + search);
    return NextResponse.redirect(url);
  }

  // If already signed in and somehow hits /login, send them home
  if (hasSession && pathname === '/login') {
    const url = req.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

/**
 * Matcher: run middleware for everything except API routes
 * and Next static/image assets (extra guard beyond isPublicPath).
 */
export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt)$).*)',
  ],
};
