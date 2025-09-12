// Shared helper to read the business header (name + short description) for a tenant.
export async function fetchTenantHeader(supabase: any, tenantId?: string | null) {
  if (!tenantId) return { bizName: "Kitchen Biz", bizBlurb: "" };

  const { data } = await supabase
    .from("tenants")
    .select("business_name,business_blurb,name")
    .eq("id", tenantId)
    .maybeSingle();

  return {
    bizName: String(data?.business_name ?? data?.name ?? "Kitchen Biz"),
    bizBlurb: String(data?.business_blurb ?? ""),
  };
}
