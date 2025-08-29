// src/lib/supabase/client.ts
import { createBrowserClient as _create } from "@supabase/ssr";

/** Zero-arg helper for browser/client components. */
export function createBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return _create(url, anon);
}

// Optional default export (safe if someone imported default earlier)
export default createBrowserClient;
