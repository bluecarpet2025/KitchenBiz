// src/lib/effective-tenant.ts
import type { SupabaseClient } from "@supabase/supabase-js";

/** Read-only demo tenant id (your seeded sample tenant). */
export const DEMO_TENANT_ID = "400c7674-3494-45e3-a68a-4ed807422866";

/**
 * Single source of truth for "which tenant should this request use?"
 * - If profile.use_demo is true OR no signed-in user -> return DEMO_TENANT_ID.
 * - Else return profile.tenant_id (or null if none).
 */
export async function effectiveTenantId(
  supabase: SupabaseClient
): Promise<{ tenantId: string | null; useDemo: boolean }> {
  const { data: u } = await supabase.auth.getUser();
  const uid = u?.user?.id ?? null;

  if (!uid) {
    // unauthenticated (or tablet secondary): show demo by default
    return { tenantId: DEMO_TENANT_ID, useDemo: true };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id, use_demo")
    .eq("id", uid)
    .maybeSingle();

  if (profile?.use_demo) return { tenantId: DEMO_TENANT_ID, useDemo: true };

  return { tenantId: (profile?.tenant_id as string | null) ?? null, useDemo: false };
}

/** Compatibility alias for existing imports in the repo. */
export const getEffectiveTenant = effectiveTenantId;

/** Guard you can call in write routes to prevent edits while in demo. */
export async function assertNotDemo(supabase: SupabaseClient) {
  const { data: u } = await supabase.auth.getUser();
  const uid = u?.user?.id ?? null;
  if (!uid) return;

  const { data: p } = await supabase
    .from("profiles")
    .select("use_demo")
    .eq("id", uid)
    .maybeSingle();

  if (p?.use_demo) {
    const err = new Error("Read-only demo mode: writes are disabled.");
    // @ts-ignore
    err.status = 403;
    throw err;
  }
}
