// src/lib/effective-tenant.ts
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Single place to resolve which tenant to use for reads/writes.
 * - If profile.use_demo is true => route all queries to the DEMO tenant (read-only UX can be enforced at the UI layer).
 * - Otherwise use the user's own tenant_id from profiles.
 *
 * NOTE: Your SQL views already use tenant_for_select() for row filtering.
 *       We still return tenantId explicitly for client components and direct table access.
 */
export async function effectiveTenantId(
  supabase: SupabaseClient
): Promise<{ tenantId: string | null; useDemo: boolean }> {
  // Your seeded demo/sample data lives on this tenant:
  const DEMO_TENANT_ID = "400c7674-3494-45e3-a68a-4ed807422866";

  const { data: u } = await supabase.auth.getUser();
  const uid = u?.user?.id ?? null;
  if (!uid) return { tenantId: null, useDemo: false };

  const { data: prof } = await supabase
    .from("profiles")
    .select("tenant_id, use_demo")
    .eq("id", uid)
    .maybeSingle();

  const useDemo = !!prof?.use_demo;
  const tenantId = useDemo ? DEMO_TENANT_ID : (prof?.tenant_id as string | null) ?? null;

  return { tenantId, useDemo };
}
