import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import dynamic from "next/dynamic";

// sign out is a client component
const SignOutButton = dynamic(() => import("./SignOutButton"), { ssr: false });

export default async function TopNav() {
  const supabase = await createServerClient();
  const [{ data: { user } }, { data: profile }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("profiles").select("display_name").maybeSingle(),
  ]);

  const displayName = profile?.display_name ?? user?.email ?? null;

  return (
    <header className="border-b border-neutral-900">
      <nav className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
        {/* Left: brand + sections */}
        <Link href="/" className="font-semibold">Kitchen Biz</Link>
        <div className="flex-1" />
        {/* Right side: user, Sign out / Log in, then Help/FAQ in the far corner */}
        <div className="flex items-center gap-4">
          {displayName && (
            <span className="text-sm text-neutral-300">{displayName}</span>
          )}
          {user ? (
            <SignOutButton />
          ) : (
            <Link href="/login" className="text-sm underline underline-offset-4">
              Log in / Sign up
            </Link>
          )}
          <Link
            href="/help"
            className="text-sm opacity-80 hover:opacity-100 ml-2"
          >
            Help / FAQ
          </Link>
        </div>
      </nav>
    </header>
  );
}
