"use client";

import { useState } from "react";
import createClient from "@/lib/supabase/client";

export default function SignupForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${location.origin}/auth/callback`,
      },
    });
    if (error) setMsg(error.message);
    else setMsg("Check your inbox for a magic link.");
    setBusy(false);
  };

  return (
    <form onSubmit={submit} className="max-w-xl flex gap-2">
      <input
        type="email"
        required
        placeholder="your@email.com"
        className="w-full rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <button
        disabled={busy}
        className="rounded-md bg-neutral-100 text-black px-4 py-2 disabled:opacity-50"
      >
        {busy ? "Sending…" : "Send magic link"}
      </button>
      {msg && <div className="text-sm text-neutral-300 ml-3">{msg}</div>}
    </form>
  );
}
