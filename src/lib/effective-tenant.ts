// src/lib/effective-tenant.ts
import { createServerClient } from "@/lib/supabase/server";

type EffTenant = { tenantId: string | null; useDemo: boolean };

const FALLBACK_DEMO_TENANT =
  process.env.DEMO_TENANT_ID || "400c7674-3494-45e3-a68a-4ed807422866";

/**
 * Single source of truth for the effective tenant.
 * - If profile.use_demo = true: always return the demo tenant id
 * - Else: return the user’s real tenant id
 */
async function computeEffectiveTenant(): Promise<EffTenant> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { tenantId: null, useDemo: false };

  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id, use_demo")
    .eq("id", user.id)
    .maybeSingle();

  const useDemo = !!profile?.use_demo;
  if (useDemo) return { tenantId: FALLBACK_DEMO_TENANT, useDemo: true };

  const realTenant = (profile as any)?.tenant_id ?? null;
  return { tenantId: realTenant, useDemo: false };
}

/**
 * New API (no args): returns { tenantId, useDemo }
 */
export async function effectiveTenantId(): Promise<EffTenant> {
  return computeEffectiveTenant();
}

/**
 * Legacy helper some routes expect to return just the tenantId string.
 * Accepts any args (ignored) to stay source-compatible with older calls.
 * Example legacy call: getEffectiveTenant(supabase)
 */
export async function getEffectiveTenant(..._ignored: any[]): Promise<string | null> {
  const { tenantId } = await computeEffectiveTenant();
  return tenantId;
}

/**
 * Default export: also tolerate any args; returns { tenantId, useDemo }.
 * This lets older code call effectiveTenantId(supabase) without type errors.
 */
export default async function effectiveTenantIdCompat(..._ignored: any[]): Promise<EffTenant> {
  return computeEffectiveTenant();
}
