import { NextResponse, NextRequest } from 'next/server';

const PROTECTED = [/^\/inventory/, /^\/recipes/, /^\/menu/, /^\/app/];

export function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const token = req.cookies.get('sb-access-token')?.value
             || req.cookies.get('sb:token')?.value; // Supabase cookie names

  const needsAuth = PROTECTED.some((re) => re.test(url.pathname));
  if (needsAuth && !token) {
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next|favicon.ico|assets|public).*)'],
};
