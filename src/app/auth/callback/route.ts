// src/app/auth/callback/route.ts
import { NextResponse } from "next/server";
import { cookies as nextCookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/";

  // ⬇️ Next 15: await cookies() so we can .get/.set
  const cookieStore = await nextCookies();

  // Server-side Supabase client that can read/write auth cookies
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          cookieStore.set({ name, value: "", ...options });
        },
      },
    }
  );

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const to = new URL("/login", url.origin);
      to.searchParams.set("error", error.message);
      return NextResponse.redirect(to);
    }
  }

  // Remove ?code from the URL and send them into the app
  return NextResponse.redirect(new URL(next, url.origin));
}
