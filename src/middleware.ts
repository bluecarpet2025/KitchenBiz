// src/middleware.ts
import { NextRequest, NextResponse } from 'next/server';

/**
 * Public routes = allowed without auth.
 * Keep "/" and "/login" public. Also allow read-only shares under /share/*.
 */
const PUBLIC_PATHS = ['/', '/login'];
function isPublicPath(pathname: string) {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  if (pathname === '/favicon.ico') return true;
  if (pathname.startsWith('/share/')) return true; // <-- important for public share links
  // Next assets and common static files
  if (pathname.startsWith('/_next')) return true;
  if (/\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt)$/.test(pathname)) return true;
  return false;
}

/**
 * Your Supabase project ref is zdwenjdspvbfouooqlco
 * Cookie prefix is sb-<project-ref>-auth-token
 */
const SB_AUTH_COOKIE = 'sb-zdwenjdspvbfouooqlco-auth-token';

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // Allow non-mutating preflight/robots/etc without checks
  if (req.method === 'OPTIONS' || req.method === 'HEAD') {
    return NextResponse.next();
  }

  // Public & static always pass
  if (isPublicPath(pathname)) return NextResponse.next();

  // Consider user "signed in" if any Supabase auth cookie is present
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

  // If already signed in and hits /login, send them home
  if (hasSession && pathname === '/login') {
    const url = req.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // run on everything except API and Next static/image; extra guard beyond isPublicPath
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt)$).*)',
  ],
};
