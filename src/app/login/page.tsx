"use client";

import Link from "next/link";
import GoogleSignIn from "@/components/GoogleSignIn";
import SignupForm from "@/components/SignupForm";
import OptInForm from "@/components/OptInForm";

export default function LoginPage() {
  return (
    <main className="max-w-2xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Log in / Sign up</h1>
        <Link href="/help" className="underline">
          Help / FAQ
        </Link>
      </div>

      <p className="text-neutral-300 mb-6">
        Use your email (magic link) or continue with Google.
      </p>

      <div className="space-y-6">
        {/* Google OAuth */}
        <GoogleSignIn />

        {/* Email magic link – unchanged, re-using your component */}
        <SignupForm />

        {/* Beta / feedback opt-in */}
        <OptInForm />
      </div>

      <div className="mt-6">
        <Link href="/" className="underline">
          ← Back to home
        </Link>
      </div>
    </main>
  );
}
