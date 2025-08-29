"use client";

import createClient from "@/lib/supabase/client";

export default function GoogleSignIn() {
  const signIn = async () => {
    const supabase = createClient();
    // Send users back to your app to complete the session exchange
    const redirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}/auth/callback`
        : undefined;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });

    if (error) alert(error.message);
  };

  return (
    <button
      onClick={signIn}
      className="w-full rounded-md border px-4 py-2 hover:bg-neutral-900"
    >
      Continue with Google
    </button>
  );
}
