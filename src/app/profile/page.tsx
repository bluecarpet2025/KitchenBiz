import { createServerClient } from "@/lib/supabase/server";
import ProfileForm from "./ProfileForm";

export default async function ProfilePage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    // not signed in -> push to /login
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <p>Please <a className="underline" href="/login">log in</a>.</p>
      </main>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, use_demo")
    .eq("id", user.id)
    .single();

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold mb-6">Profile</h1>
      <ProfileForm
        initialName={profile?.display_name ?? ""}
        initialUseDemo={!!profile?.use_demo}
      />
      <p className="mt-6 text-sm text-neutral-400">
        When <strong>Use demo data</strong> is on, you’ll see the read-only
        <em> Pizza Demo (Tester)</em> tenant everywhere.
      </p>
    </main>
  );
}
