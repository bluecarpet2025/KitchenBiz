import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/', '/login'];

const SB_AUTH_COOKIE = 'sb-zdwenjdspvbfouooqlco-auth-token';

function isPublicPath(pathname: string) {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  // Public share pages
  if (pathname === '/share' || pathname.startsWith('/share/')) return true;

  if (pathname.startsWith('/_next')) return true;
  if (pathname === '/favicon.ico') return true;
  if (/\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt)$/.test(pathname)) return true;
  return false;
}

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (isPublicPath(pathname)) return NextResponse.next();

  const hasSession =
    Boolean(req.cookies.get(SB_AUTH_COOKIE)) ||
    req.cookies.getAll().some((c) => c.name.startsWith(SB_AUTH_COOKIE));

  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', pathname + search);
    return NextResponse.redirect(url);
  }

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
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt)$).*)',
  ],
};
