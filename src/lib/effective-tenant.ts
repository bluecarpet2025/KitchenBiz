// src/lib/effective-tenant.ts
import { createServerClient } from "@/lib/supabase/server";

/**
 * Hard-coded demo tenant (read-only).
 * You told me your seeded demo lives in:
 * 400c7674-3494-45e3-a68a-4ed807422866
 */
export const DEMO_TENANT_ID = "400c7674-3494-45e3-a68a-4ed807422866";

export type EffectiveTenantResult = {
  /** The tenant id callers should use for SELECTs (and INSERTs if not demo). */
  tenantId: string | null;
  /** Whether we are in demo/read-only mode. */
  useDemo: boolean;
};

/**
 * Resolve the effective tenant for the signed-in user.
 * - If profile.use_demo is true => return DEMO tenant + useDemo=true
 * - Else return the user's own tenant_id (or null if none)
 */
export async function effectiveTenantId(): Promise<EffectiveTenantResult> {
  const supabase = await createServerClient();

  // who am I?
  const { data: u } = await supabase.auth.getUser();
  const uid = u?.user?.id ?? null;
  if (!uid) return { tenantId: null, useDemo: false };

  // read profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id, use_demo")
    .eq("id", uid)
    .maybeSingle();

  const useDemo = !!profile?.use_demo;

  if (useDemo) {
    // demo is always read-only, make it explicit to consumers
    return { tenantId: DEMO_TENANT_ID, useDemo: true };
  }

  return { tenantId: (profile?.tenant_id as string | null) ?? null, useDemo: false };
}

/**
 * Back-compat export so existing files that do:
 *   import { getEffectiveTenant } from "@/lib/effective-tenant"
 * keep working without edits.
 *
 * NOTE: same signature & behavior as effectiveTenantId() above.
 */
export const getEffectiveTenant = effectiveTenantId;
