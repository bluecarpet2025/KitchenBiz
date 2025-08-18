import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function NewMenuCreator() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/menu/new");

  const { data: profile } = await supabase.from("profiles").select("tenant_id").eq("id", user.id).single();
  const tenantId = (profile as any)?.tenant_id;
  if (!tenantId) redirect("/app");

  const { data: ins, error } = await supabase
    .from("menus")
    .insert({ tenant_id: tenantId, name: "New Menu" })
    .select("id")
    .single();
  if (error || !ins?.id) redirect("/menu");

  redirect(`/menu?menu_id=${ins.id}`);
}
