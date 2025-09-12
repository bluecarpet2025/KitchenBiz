import { createServerClient } from "@/lib/supabase/server";
import ProfileForm from "./ProfileForm";

export default async function ProfilePage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <p>Please <a className="underline" href="/login">log in</a>.</p>
      </main>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, use_demo, tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  let businessName = "";
  let businessBlurb = "";
  if (profile?.tenant_id) {
    const { data: t } = await supabase
      .from("tenants")
      .select("name, short_description")
      .eq("id", profile.tenant_id)
      .maybeSingle();
    businessName = (t?.name ?? "").toString();
    businessBlurb = (t?.short_description ?? "").toString();
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold mb-6">Profile</h1>
      <ProfileForm
        initialName={profile?.display_name ?? ""}
        initialUseDemo={!!profile?.use_demo}
        initialBusinessName={businessName}
        initialBusinessBlurb={businessBlurb}
        tenantId={(profile?.tenant_id as string) ?? null}
      />
      <p className="mt-6 text-sm text-neutral-400">
        When <strong>Use demo data</strong> is on, you’ll see the read-only
        <em> Pizza Demo (Tester)</em> tenant everywhere. Business settings are disabled in demo mode.
      </p>
    </main>
  );
}
