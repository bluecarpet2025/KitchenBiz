// src/app/login/page.tsx
"use client";

import { useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<"enter" | "verify">("enter");
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const redirectTo = typeof window !== "undefined" ? window.location.origin : "";

  async function sendLinkOrCode() {
    setMsg(null);
    // This sends a Magic Link if OTP isn’t enabled; if OTP is enabled in Supabase,
    // the email will contain a one-time code and/or link depending on your settings.
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${redirectTo}/` },
    });
    if (error) setMsg(error.message);
    else {
      setMsg("Check your email for the link or code.");
      setStep("verify");
    }
  }

  async function verifyCode() {
    setMsg(null);
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: "email", // verify email OTP
    });
    if (error) setMsg(error.message);
    else setMsg("Signed in! You can close this tab.");
  }

  async function signInWithGoogle() {
    setMsg(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${redirectTo}/` },
    });
    if (error) setMsg(error.message);
  }

  return (
    <main className="max-w-md mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Sign in</h1>

      <div className="space-y-3">
        <label className="block text-sm">Email</label>
        <input
          className="w-full rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />

        {step === "enter" ? (
          <button
            onClick={sendLinkOrCode}
            className="rounded-md px-4 py-2 bg-neutral-200 text-black"
          >
            Send magic link / code
          </button>
        ) : (
          <div className="space-y-3">
            <label className="block text-sm">6-digit code (if your email shows one)</label>
            <input
              className="w-full rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
            />
            <div className="flex gap-2">
              <button
                onClick={verifyCode}
                className="rounded-md px-4 py-2 bg-neutral-200 text-black"
              >
                Verify code
              </button>
              <button
                onClick={() => setStep("enter")}
                className="rounded-md px-3 py-2 border border-neutral-600"
              >
                Start over
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-neutral-800 pt-6">
        <button
          onClick={signInWithGoogle}
          className="rounded-md px-4 py-2 bg-neutral-200 text-black"
        >
          Continue with Google
        </button>
      </div>

      {msg && <div className="text-sm text-neutral-400">{msg}</div>}
    </main>
  );
}
