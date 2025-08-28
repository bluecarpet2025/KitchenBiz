// src/lib/effective-tenant.ts
import { createServerClient } from "@/lib/supabase/server";

export async function getEffectiveTenant() {
  const supabase = await createServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user ?? null;

  if (!user) {
    return { user: null, tenantId: null, isDemo: false, profile: null };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id, display_name, use_demo")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.use_demo) {
    const { data: demoT } = await supabase
      .from("tenants")
      .select("id")
      .eq("name", "Pizza Demo (Tester)")
      .maybeSingle();
    return { user, tenantId: demoT?.id ?? null, isDemo: true, profile };
  }

  return {
    user,
    tenantId: profile?.tenant_id ?? null,
    isDemo: false,
    profile,
  };
}
