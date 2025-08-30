// src/lib/effective-tenant.ts
import { createServerClient } from "@/lib/supabase/server";

/**
 * Returns the tenant id to use for reads:
 * - demo tenant when profiles.use_demo = true
 * - otherwise the user's own tenant_id
 * - null if not signed in or no profile row
 */
export async function getEffectiveTenant(
  supabaseArg?: Awaited<ReturnType<typeof createServerClient>>
): Promise<string | null> {
  const supabase = supabaseArg ?? (await createServerClient());

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: prof } = await supabase
    .from("profiles")
    .select("tenant_id, use_demo")
    .eq("id", user.id)
    .maybeSingle();

  if (!prof) return null;

  if (prof.use_demo === true) {
    // ask Postgres for the demo tenant id
    const { data: demoId } = await supabase.rpc("demo_tenant_id");
    return (demoId as string) ?? null;
  }

  return (prof.tenant_id as string) ?? null;
}
