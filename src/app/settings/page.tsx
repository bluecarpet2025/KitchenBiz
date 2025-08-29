// src/app/settings/page.tsx
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";

async function updateProfile(formData: FormData) {
  "use server";
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/settings");

  const display_name = (formData.get("display_name")?.toString() ?? "").trim() || null;
  const use_demo = formData.get("use_demo") === "on";

  await supabase.from("profiles")
    .update({ display_name, use_demo })
    .eq("id", user.id);

  revalidatePath("/");
  revalidatePath("/settings");
}

export default async function SettingsPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/settings");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, use_demo")
    .eq("id", user.id)
    .single();

  return (
    <main className="max-w-xl">
      <h1 className="text-2xl font-semibold mb-4">Profile</h1>
      <form action={updateProfile} className="space-y-6">
        <div>
          <label className="block text-sm mb-1">Display name</label>
          <input
            name="display_name"
            defaultValue={profile?.display_name ?? ""}
            className="w-full rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2"
            placeholder="e.g., Juan at Kitchen A"
          />
          <p className="text-xs opacity-70 mt-1">
            Shown in the top-right instead of your email.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <input
            id="use_demo"
            name="use_demo"
            type="checkbox"
            defaultChecked={!!profile?.use_demo}
            className="h-4 w-4"
          />
          <label htmlFor="use_demo" className="select-none">
            Use Pizza Demo data (read-only)
          </label>
        </div>

        <button className="rounded-md border border-neutral-700 px-4 py-2 hover:bg-neutral-900">
          Save
        </button>
      </form>

      <p className="text-sm opacity-70 mt-6">
        When the demo is enabled, you can browse the Pizza Demo tenant’s data but cannot edit it.
        Switch this off to get back to your own tenant’s data.
      </p>
    </main>
  );
}
