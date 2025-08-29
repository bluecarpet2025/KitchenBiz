"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import SignupForm from "@/components/SignupForm";

export default function LoginPage() {
  const [busy, setBusy] = useState(false);

  async function signInWithGoogle() {
    setBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          queryParams: { prompt: "select_account" },
          redirectTo:
            typeof window !== "undefined"
              ? `${window.location.origin}/auth/callback`
              : undefined,
        },
      });
      if (error) alert(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="max-w-md mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-2">Log in / Sign up</h1>
      <p className="text-neutral-300 mb-6">
        Use your email (magic link) or continue with Google.
      </p>

      <button
        onClick={signInWithGoogle}
        disabled={busy}
        className="w-full rounded border px-4 py-2 mb-6 hover:bg-neutral-900 disabled:opacity-60"
      >
        {busy ? "Redirecting…" : "Continue with Google"}
      </button>

      <SignupForm />

      <p className="mt-6 text-sm text-neutral-400">
        <Link href="/">← Back to home</Link>
      </p>
    </main>
  );
}
