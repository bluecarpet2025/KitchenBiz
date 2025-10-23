// src/lib/effective-tenant-client.ts
import createBrowserClient from "@/lib/supabase/client";

type EffTenant = { tenantId: string | null; useDemo: boolean };

const FALLBACK_DEMO_TENANT =
  process.env.NEXT_PUBLIC_DEMO_TENANT_ID || "400c7674-3494-45e3-a68a-4ed807422866";

/**
 * Client-safe version of effectiveTenantId()
 * Uses browser Supabase client instead of server (no next/headers)
 */
export async function effectiveTenantIdClient(): Promise<EffTenant> {
  const supabase = createBrowserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { tenantId: null, useDemo: false };

  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id, use_demo")
    .eq("id", user.id)
    .maybeSingle();

  const useDemo = !!profile?.use_demo;
  if (useDemo) return { tenantId: FALLBACK_DEMO_TENANT, useDemo: true };

  return { tenantId: profile?.tenant_id ?? null, useDemo: false };
}
