// src/lib/effective-tenant.ts
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Single source of truth for "which tenant should this request use?"
 *
 * Behavior:
 * - If the user is signed in and their profile.use_demo is true -> return DEMO_TENANT_ID.
 * - If the user is signed in and use_demo is false -> return profile.tenant_id (or null if none).
 * - If not signed in -> still try to use DEMO_TENANT_ID (so demo works on tablet/secondary).
 *
 * NOTE:
 * - Reads only. Write routes should separately guard against use_demo to keep demo read-only.
 */
const DEMO_TENANT_ID = "400c7674-3494-45e3-a68a-4ed807422866";

export async function effectiveTenantId(
  supabase: SupabaseClient
): Promise<{ tenantId: string | null; useDemo: boolean }> {
  // Try to read current user
  const { data: u } = await supabase.auth.getUser();
  const uid = u?.user?.id ?? null;

  if (!uid) {
    // No auth (or tablet secondary with no linked tenant): show demo by default
    return { tenantId: DEMO_TENANT_ID, useDemo: true };
  }

  // Pull profile (has tenant_id + use_demo)
  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id, use_demo")
    .eq("id", uid)
    .maybeSingle();

  // Explicit demo toggle wins
  if (profile?.use_demo) {
    return { tenantId: DEMO_TENANT_ID, useDemo: true };
  }

  // Normal case – user’s own tenant
  const tid = (profile?.tenant_id as string | null) ?? null;
  return { tenantId: tid, useDemo: false };
}

/**
 * Helper you can use in server actions / API routes to prevent writes while in demo.
 * Throwing avoids accidental writes to any table when profile.use_demo is on.
 */
export async function assertNotDemo(supabase: SupabaseClient) {
  const { data: u } = await supabase.auth.getUser();
  const uid = u?.user?.id ?? null;
  if (!uid) return; // unauth routes already shouldn't write

  const { data: profile } = await supabase
    .from("profiles")
    .select("use_demo")
    .eq("id", uid)
    .maybeSingle();

  if (profile?.use_demo) {
    const err = new Error("Read-only demo mode: writes are disabled.");
    // @ts-ignore add friendly marker if you want to pattern-match upstream
    err.status = 403;
    throw err;
  }
}
