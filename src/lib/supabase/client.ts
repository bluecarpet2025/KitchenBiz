// src/lib/supabase/client.ts
// Wrapper that exposes both a convenience createClient() and the raw createBrowserClient.

import { createBrowserClient as _createBrowserClient } from "@supabase/ssr";

/** Convenience factory used across client components */
export function createClient() {
  return _createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

/** Also export the raw helper for any components that already import it directly */
export { _createBrowserClient as createBrowserClient };
