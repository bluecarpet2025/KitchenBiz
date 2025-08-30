import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import SignOutButton from "./SignOutButton";

export default async function TopNav() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  let displayName: string | null = null;
  if (user) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();
    displayName = (prof?.display_name?.trim()?.length ? prof.display_name : null)
      ?? (user.email ? user.email.split("@")[0] : null);
  }

  return (
    <header className="border-b border-neutral-900">
      <nav className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
        <Link href="/" className="font-semibold">Kitchen Biz</Link>
        <Link href="/inventory" className="hover:underline">Inventory</Link>
        <Link href="/recipes" className="hover:underline">Recipes</Link>
        <Link href="/menu" className="hover:underline">Menu</Link>

        {/* Right side: user label, then Help all the way in the corner */}
        <div className="ml-auto flex items-center gap-4">
          {user ? (
            <>
              <Link href="/profile" className="text-sm">{displayName}</Link>
              <SignOutButton />
            </>
          ) : (
            <Link href="/login" className="text-sm underline underline-offset-4">
              Log in / Sign up
            </Link>
          )}

          <Link href="/help" className="text-xs text-blue-300 hover:text-blue-200">
            Help / FAQ
          </Link>
        </div>
      </nav>
    </header>
  );
}
