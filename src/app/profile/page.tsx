// src/app/profile/page.tsx
import { createServerClient } from "@/lib/supabase/server";
import ProfileForm from "./ProfileForm";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="max-w-2xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Profile</h1>
        <p className="mt-4">Please sign in to manage your profile.</p>
      </main>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, use_demo")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <main className="max-w-2xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Profile</h1>
      <ProfileForm
        initialDisplayName={profile?.display_name ?? ""}
        initialUseDemo={!!profile?.use_demo}
      />
      <p className="text-sm text-neutral-400">
        When <strong>Use demo data</strong> is on, you’ll see the read-only{" "}
        <em>Pizza Demo (Tester)</em> tenant everywhere.
      </p>
    </main>
  );
}
