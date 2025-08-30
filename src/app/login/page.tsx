import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";

export default async function LoginPage({
  searchParams,
}: { searchParams?: { error?: string } }) {
  const error = searchParams?.error;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold mb-2">Log in / Sign up</h1>
      <p className="text-neutral-300 mb-6">
        Use your email (magic link) or continue with Google.
      </p>

      <form action="/auth/google" method="post" className="mb-6">
        <button
          className="w-full rounded-md border px-4 py-3 hover:bg-neutral-900"
        >
          Continue with Google
        </button>
      </form>

      <EmailMagicLinkForm />

      {error && (
        <p className="mt-6 text-sm text-red-400">
          {decodeURIComponent(error)}
        </p>
      )}

      <p className="mt-8">
        <Link href="/" className="underline underline-offset-4">
          ← Back to home
        </Link>
      </p>
    </main>
  );
}

/* --- magic link subform (server action) --- */
async function EmailMagicLinkForm() {
  "use server";
  return (
    <form action={sendMagic} className="flex gap-2">
      <input
        type="email"
        name="email"
        required
        placeholder="your@email.com"
        className="w-full rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2"
      />
      <button className="rounded-md bg-neutral-100 text-black px-4 py-2">
        Send magic link
      </button>
    </form>
  );
}

async function sendMagic(form: FormData) {
  "use server";
  const email = String(form.get("email") ?? "");
  const supabase = await createServerClient();
  await supabase.auth.signInWithOtp({ email });
}
