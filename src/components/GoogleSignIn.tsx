"use client";

import { createClient } from "@/lib/supabase/client";

export default function GoogleSignIn() {
  const signIn = async () => {
    const supabase = createClient();

    // Start the Google OAuth flow
    await supabase.auth.signInWithOAuth({
      provider: "google",
      // You can omit redirectTo; Supabase will use the current URL.
      // If you add an auth callback route later, uncomment the next line:
      // options: { redirectTo: `${location.origin}/auth/callback` },
    });
  };

  return (
    <button
      onClick={signIn}
      className="w-full rounded border px-4 py-2 mb-6 hover:bg-neutral-900"
      aria-label="Continue with Google"
    >
      Continue with Google
    </button>
  );
}
