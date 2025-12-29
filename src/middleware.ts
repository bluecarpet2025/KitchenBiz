// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

const PUBLIC_PATHS = [
  "/",              // landing
  "/login",         // login
  "/auth/callback", // supabase magic-link handler
];

function isPublic(pathname: string) {
  if (PUBLIC_PATHS.includes(pathname)) return true;

  // public share links
  if (pathname.startsWith("/app/share/")) return true;

  // Stripe endpoints must be public (webhooks + checkout/portal endpoints)
  if (pathname.startsWith("/api/stripe/")) return true;

  if (pathname === "/favicon.ico") return true;
  return false;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const login = new URL("/login", req.url);
    login.searchParams.set("redirect", pathname + (req.nextUrl.search || ""));
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

// Match everything in app, we’ll early-return for public routes
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
