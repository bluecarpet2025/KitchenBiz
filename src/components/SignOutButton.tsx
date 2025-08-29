"use client";

import { createBrowserClient } from "@/lib/supabase/client";

export default function SignOutButton() {
  const signOut = async () => {
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    // bounce to home (or /login if you prefer)
    window.location.href = "/";
  };

  return (
    <button
      onClick={signOut}
      className="mt-6 rounded-md bg-neutral-800 hover:bg-neutral-700 text-sm px-3 py-2"
    >
      Sign out
    </button>
  );
}
