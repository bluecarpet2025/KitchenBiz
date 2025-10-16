// src/lib/effective-tenant.ts
import { createServerClient } from "@/lib/supabase/server";

type EffTenant = { tenantId: string | null; useDemo: boolean };

const FALLBACK_DEMO_TENANT =
  process.env.DEMO_TENANT_ID || "400c7674-3494-45e3-a68a-4ed807422866";

/**
 * Single source of truth for the effective tenant.
 * - If profile.use_demo = true: always return the demo tenant id
 * - Else: return the user’s own tenant id (from profiles.tenants join or your existing logic)
 */
async function _computeEffectiveTenant(): Promise<EffTenant> {
  const supabase = await createServerClient();

  // Who am I?
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { tenantId: null, useDemo: false };

  // Profile (has use_demo and tenant_id reference)
  const { data: profile } = await supabase
    .from("profiles")
    .select("use_demo, tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  const useDemo = !!profile?.use_demo;

  if (useDemo) {
    return { tenantId: FALLBACK_DEMO_TENANT, useDemo: true };
  }

  // Your real tenant id
  const realTenant = (profile as any)?.tenant_id ?? null;
  return { tenantId: realTenant, useDemo: false };
}

/**
 * New API (no args)
 */
export async function effectiveTenantId(): Promise<EffTenant> {
  return _computeEffectiveTenant();
}

/**
 * Legacy alias some files may be importing.
 */
export async function getEffectiveTenant(): Promise<EffTenant> {
  return _computeEffectiveTenant();
}

/**
 * Backwards-compatible wrapper: tolerate any arguments.
 * This prevents “Expected 0 arguments, but got 1” build errors.
 * We ignore the argument and compute from the server session/profile.
 */
const effectiveTenantIdCompat = async (..._ignored: any[]): Promise<EffTenant> =>
  _computeEffectiveTenant();

export default effectiveTenantIdCompat;
