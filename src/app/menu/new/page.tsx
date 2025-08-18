import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function NewMenuCreator() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/menu/new");

  const { data: profile, error: pErr } = await supabase
    .from("profiles").select("tenant_id").eq("id", user.id).single();
  if (pErr || !profile?.tenant_id) redirect("/app");

  const { data: ins, error } = await supabase
    .from("menus")
    .insert({ tenant_id: profile.tenant_id, name: "New Menu" })
    .select("id")
    .single();

  if (error || !ins?.id) {
    // show the error plainly so we can fix policies fast
    return (
      <div className="max-w-xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">New Menu</h1>
        <p className="mt-4 text-red-500">Failed to create menu: {error?.message || "Unknown error"}</p>
        <a href="/menu" className="underline">Back to Menu</a>
      </div>
    );
  }

  redirect(`/menu?menu_id=${ins.id}&created=1`);
}
