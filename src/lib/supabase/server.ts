// src/lib/supabase/server.ts
import { cookies } from "next/headers";
import { createServerClient as createSSRClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";

/**
 * Next.js 15: cookies() is async (Promise<ReadonlyRequestCookies>).
 * Make this helper async and await cookies() internally.
 */
export async function createServerClient(
  cookieStore?: Awaited<ReturnType<typeof cookies>>
) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const store = cookieStore ?? (await cookies());

  return createSSRClient(url, key, {
    cookies: {
      get(name: string) {
        return store.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          store.set({ name, value, ...options });
        } catch {}
      },
      remove(name: string, options: CookieOptions) {
        try {
          store.set({ name, value: "", ...options });
        } catch {}
      },
    },
  });
}
