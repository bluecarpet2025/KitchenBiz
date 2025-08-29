// src/components/TopNav.tsx
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";

export default async function TopNav() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let label: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .single();
    label = profile?.display_name?.trim() || user.email || null;
  }

  return (
    <header className="flex items-center justify-between px-4 py-3">
      <nav className="flex items-center gap-5">
        <Link href="/" className="font-semibold">Kitchen Biz</Link>
        <Link href="/inventory">Inventory</Link>
        <Link href="/recipes">Recipes</Link>
        <Link href="/menu">Menu</Link>
      </nav>

      <div className="flex items-center gap-4">

        {user ? (
          <div className="flex items-center gap-3">
            <span className="text-sm opacity-80">{label}</span>
            <Link href="/profile" className="text-sm underline">Profile</Link>
            <Link href="/login?signout=1" className="text-sm underline">Sign out</Link>
          </div>
        ) : (
          <Link href="/login" className="text-sm underline">
            Log in / Sign up
          </Link>
        )}

        <Link href="/help" className="text-sm text-neutral-300 hover:text-white">
          Help / FAQ
        </Link>
      </div>
    </header>
  );
}
