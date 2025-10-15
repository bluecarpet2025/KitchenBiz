// src/lib/effective-tenant.ts
import { createServerClient } from "@/lib/supabase/server";

/**
 * Read-only demo tenant you seeded.
 * You told me this is the ID where all demo/sample data lives.
 */
export const DEMO_TENANT_ID = "400c7674-3494-45e3-a68a-4ed807422866";

export type EffectiveTenantResult = {
  /** Tenant id to use for SELECTs (and for writes when not demo). */
  tenantId: string | null;
  /** True when user chose "Use demo data (read-only)". */
  useDemo: boolean;
};

/**
 * Resolve the effective tenant for the signed-in user.
 * - If profile.use_demo is true => use the DEMO tenant and mark as read-only
 * - Otherwise return the user's own tenant_id
 */
export async function effectiveTenantId(): Promise<EffectiveTenantResult> {
  const supabase = await createServerClient();

  const { data: u } = await supabase.auth.getUser();
  const uid = u?.user?.id ?? null;
  if (!uid) return { tenantId: null, useDemo: false };

  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id, use_demo")
    .eq("id", uid)
    .maybeSingle();

  const useDemo = !!profile?.use_demo;

  if (useDemo) {
    return { tenantId: DEMO_TENANT_ID, useDemo: true };
  }

  return {
    tenantId: (profile?.tenant_id as string | null) ?? null,
    useDemo: false,
  };
}

/**
 * Back-compat wrapper for legacy callers that expect:
 *   getEffectiveTenant(supabase?) -> Promise<string|null>
 *
 * Accepts an optional argument (ignored) so code like
 *   getEffectiveTenant(supabase)
 * continues to type-check. Returns only the tenant id string.
 */
export async function getEffectiveTenant(_maybeSupabase?: unknown): Promise<string | null> {
  const { tenantId } = await effectiveTenantId();
  return tenantId;
}
