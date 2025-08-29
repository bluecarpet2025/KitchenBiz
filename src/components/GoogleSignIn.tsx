// src/components/GoogleSignIn.tsx
"use client";

import { createBrowserClient } from "@/lib/supabase/client";

export default function GoogleSignIn() {
  const signIn = async () => {
    const supabase = createBrowserClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        // Supabase handles the callback at <project>.supabase.co/auth/v1/callback
        redirectTo: window.location.origin, // back to app after auth
      },
    });
  };

  return (
    <button
      onClick={signIn}
      className="rounded-lg border border-neutral-700 px-3 py-2 text-sm hover:bg-neutral-900"
      type="button"
    >
      Continue with Google
    </button>
  );
}
