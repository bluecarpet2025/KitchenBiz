"use client";
import { createBrowserClient as createSSRBrowser } from "@supabase/ssr";
import { useMemo } from "react";

export function createBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createSSRBrowser(url, key);
}

/** Optional hook if you ever want memoization */
export function useSupabase() {
  return useMemo(() => createBrowserClient(), []);
}
