// src/app/login/page.tsx
export const dynamic = "force-dynamic";

import Link from "next/link";
import GoogleSignIn from "@/components/GoogleSignIn";
import SignupForm from "@/components/SignupForm";

type Search = { error?: string };

export default async function LoginPage({
  searchParams,
}: {
  // Next.js 15: searchParams is a Promise
  searchParams?: Promise<Search>;
}) {
  const sp = await searchParams;
  const error = sp?.error ? decodeURIComponent(sp.error) : null;

  return (
    <main className="max-w-2xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Log in / Sign up</h1>
        <Link href="/" className="underline text-sm">
          ← Back to home
        </Link>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-900/30 text-red-300 text-sm px-3 py-2">
          {error}
        </div>
      )}

      <div className="space-y-6">
        {/* Google OAuth button (client component) */}
        <GoogleSignIn />

        {/* Magic link email form */}
        <div>
          <p className="text-neutral-300 text-sm mb-2">
            Or use your email (magic link):
          </p>
          <SignupForm />
        </div>
      </div>
    </main>
  );
}
