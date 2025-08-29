"use client";

import { createBrowserClient } from "@/lib/supabase/client";

export default function GoogleSignIn({
  className = "w-full rounded border px-4 py-2 hover:bg-neutral-900",
}: {
  className?: string;
}) {
  const signIn = async () => {
    const supabase = createBrowserClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      // If you’ve set “Site URL” in Supabase you can omit redirectTo.
      // options: { redirectTo: `${window.location.origin}` },
    });
    if (error) alert(error.message);
  };

  return (
    <button onClick={signIn} className={className}>
      Continue with Google
    </button>
  );
}
