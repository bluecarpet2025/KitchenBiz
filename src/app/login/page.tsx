// src/app/login/page.tsx
"use client";

import Link from "next/link";
import GoogleSignIn from "@/components/GoogleSignIn";
import SignupForm from "@/components/SignupForm";

export default function LoginPage() {
  return (
    <main className="max-w-3xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Log in / Sign up</h1>
        <Link href="/" className="underline">← Back to home</Link>
      </div>

      <p className="text-neutral-300 mb-6">
        Use your email (magic link) or continue with Google.
      </p>

      {/* Google */}
      <div className="mb-8">
        <GoogleSignIn />
      </div>

      {/* Magic link */}
      <SignupForm />
    </main>
  );
}
