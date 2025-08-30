import { createServerClient } from "@/lib/supabase/server";

/** Returns the tenant id the current request should use (user or demo). */
export async function getEffectiveTenant() {
  const supabase = await createServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Use DB helpers so the logic matches RLS exactly
  const { data: row } = await supabase.rpc("is_demo_user");
  const demo = !!row;

  if (demo) {
    const { data } = await supabase.rpc("demo_tenant_id");
    return data as string | null;
  }

  const { data: prof } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .single();

  return (prof?.tenant_id ?? null) as string | null;
}
