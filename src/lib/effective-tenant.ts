import { createServerClient } from "@/lib/supabase/server";

// Your demo tenant id (Pizza Demo (Tester))
export const DEMO_TENANT_ID = "400c7674-3494-45e3-a68a-4ed807422866";

/**
 * Return the tenant id that the current user should read:
 *  - user's own tenant, or
 *  - demo tenant when profile.use_demo = true
 *
 * Pass in the server Supabase client you already created on the page.
 */
export async function getEffectiveTenant(
  supabase: Awaited<ReturnType<typeof createServerClient>>
): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id, use_demo")
    .eq("id", user.id)
    .single();

  if (!profile) return null;
  return profile.use_demo ? DEMO_TENANT_ID : profile.tenant_id;
}
