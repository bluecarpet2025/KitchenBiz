import { cookies } from "next/headers";
import { createServerClient as createSSRClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";

export function createServerClient(cookieStore = cookies()) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return createSSRClient(url, key, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        try { cookieStore.set({ name, value, ...options }); } catch {}
      },
      remove(name: string, options: CookieOptions) {
        try { cookieStore.set({ name, value: "", ...options }); } catch {}
      }
    }
  });
}
