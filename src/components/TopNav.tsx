import Link from "next/link";
import { getEffectiveTenant } from "@/lib/effective-tenant";
import { createServerClient } from "@/lib/supabase/server";
import dynamic from "next/dynamic";

// SignOutButton is a client component
const SignOutButton = dynamic(() => import("./SignOutButton"), { ssr: false });

export default async function TopNav() {
  const supabase = await createServerClient();

  const [{ data: { user } }, effective] = await Promise.all([
    supabase.auth.getUser(),
    getEffectiveTenant(),
  ]);

  const displayName =
    effective.displayName ??
    user?.email ??
    null;

  return (
    <header className="border-b border-neutral-900">
      <nav className="mx-auto max-w-5xl px-4 py-3 flex items-center gap-3">
        <Link href="/" className="font-semibold">Kitchen Biz</Link>

        <div className="flex-1" />

        {/* ON THE RIGHT: Help/FAQ (smaller), then user name, then Sign out */}
        <Link href="/help" className="text-sm text-blue-300 hover:text-blue-200 mr-4">
          Help / FAQ
        </Link>

        {displayName && (
          <span className="text-sm text-neutral-300 mr-3">{displayName}</span>
        )}

        {user ? (
          <SignOutButton />
        ) : (
          <Link href="/login" className="text-sm underline underline-offset-4">
            Log in / Sign up
          </Link>
        )}
      </nav>
    </header>
  );
}
