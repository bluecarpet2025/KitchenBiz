"use client";
import { createBrowserClient } from "./browser";
import type { SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;
export const supabase: SupabaseClient = (() => {
  if (_client) return _client;
  _client = createBrowserClient();
  return _client!;
})();
