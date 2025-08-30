// Server helper to choose the demo tenant when opted in
export async function getEffectiveTenant(supabase: any): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: prof } = await supabase
    .from("profiles")
    .select("tenant_id, use_demo")
    .eq("id", user.id)
    .maybeSingle();

  if (!prof?.tenant_id) return null;

  if (prof.use_demo) {
    const { data: demoId } = await supabase.rpc("demo_tenant_id");
    return demoId ?? prof.tenant_id;
  }

  return prof.tenant_id;
}
