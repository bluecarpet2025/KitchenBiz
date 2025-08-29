// src/app/login/page.tsx
import Link from "next/link";
import GoogleSignIn from "@/components/GoogleSignIn";
import SignupForm from "@/components/SignupForm";

export const dynamic = "force-dynamic";

export default function LoginPage(props: any) {
  const sp = (props?.searchParams ?? {}) as Record<string, string | string[] | undefined>;
  const raw = Array.isArray(sp.error) ? sp.error[0] : sp.error;
  const errorText = raw ? decodeURIComponent(raw) : null;

  return (
    <main className="max-w-3xl mx-auto p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Log in / Sign up</h1>
        <Link href="/" className="underline text-sm">← Back to home</Link>
      </div>

      <p className="mt-3 text-neutral-300">
        Use your email (magic link) or continue with Google.
      </p>

      {errorText && (
        <div className="mt-4 rounded-md border border-red-800 bg-red-950/40 text-red-300 text-sm px-3 py-2">
          {errorText}
        </div>
      )}

      <div className="mt-6">
        <GoogleSignIn />
      </div>

      <div className="mt-6 max-w-xl">
        <SignupForm />
      </div>
    </main>
  );
}
