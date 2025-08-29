import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import ProfileForm from "./ProfileForm";
import SignOutButton from "@/components/SignOutButton";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="max-w-3xl mx-auto p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Profile</h1>
          <Link href="/help" className="underline">Help / FAQ</Link>
        </div>
        <p className="mt-4">
          Please <Link href="/login" className="underline">log in</Link> to edit your profile.
        </p>
      </main>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, use_demo")
    .eq("id", user.id)
    .single();

  return (
    <main className="max-w-3xl mx-auto p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Profile</h1>
        <div className="flex items-center gap-4">
          <Link href="/help" className="underline">Help / FAQ</Link>
          <SignOutButton />
        </div>
      </div>

      <ProfileForm
        initialName={profile?.display_name ?? ""}
        initialUseDemo={!!profile?.use_demo}
      />

      <p className="text-sm text-neutral-400 mt-6">
        When <strong>Use demo data</strong> is on, you’ll see the read-only
        <em> Pizza Demo (Tester)</em> tenant everywhere.
      </p>
    </main>
  );
}
