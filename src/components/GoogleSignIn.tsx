"use client";

import createClient from "@/lib/supabase/client";

export default function GoogleSignIn() {
  const signIn = async () => {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${location.origin}/auth/callback`,
      },
    });
  };

  return (
    <button
      onClick={signIn}
      className="w-full rounded border px-4 py-3 hover:bg-neutral-900"
    >
      Continue with Google
    </button>
  );
}
