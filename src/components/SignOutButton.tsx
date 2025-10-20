"use client";

import { useTransition } from "react";
import createBrowserClient from "@/lib/supabase/client";

export default function SignOutButton() {
  const [pending, start] = useTransition();

  async function doSignOut() {
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    // Hard reload so the server-side session/header updates immediately
    window.location.href = "/";
  }

  return (
    <button
      onClick={() => start(doSignOut)}
      className="rounded border border-neutral-500 px-3 py-1 text-sm hover:bg-neutral-900 hover:border-neutral-400 transition-colors disabled:opacity-50"
      disabled={pending}
      aria-label="Sign out"
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
