import { DEMO_TENANT_ID } from "@/lib/constants";
import { createServerClient } from "@/lib/supabase/server";

type Result = {
  tenantId: string | null;
  displayName: string | null;
};

export async function getEffectiveTenant(): Promise<Result> {
  const supabase = await createServerClient();

  // who is logged in?
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { tenantId: null, displayName: null };

  // read the profile row for this user
  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id, use_demo, display_name")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) return { tenantId: null, displayName: null };

  // If user opted in: always point reads to the demo tenant
  const tenantId = profile.use_demo ? DEMO_TENANT_ID : profile.tenant_id;

  return {
    tenantId,
    displayName: profile.display_name ?? null,
  };
}
