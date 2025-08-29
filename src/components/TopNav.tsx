// src/components/TopNav.tsx
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function TopNav() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let display = "";
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .single();

    display = profile?.display_name?.trim() || user.email || "";
  }

  return (
    <header className="flex items-center justify-between px-4 py-3">
      <nav className="flex items-center gap-4 text-sm">
        <Link href="/" className="font-semibold">Kitchen Biz</Link>
        <Link href="/inventory" className="hover:underline">Inventory</Link>
        <Link href="/recipes" className="hover:underline">Recipes</Link>
        <Link href="/menu" className="hover:underline">Menu</Link>
      </nav>

      <div className="flex items-center gap-4">
        <Link href="/help" className="text-xs opacity-80 hover:opacity-100">
          Help / FAQ
        </Link>

        {user ? (
          <Link
            href="/profile"
            className="text-sm rounded-md bg-neutral-900 border border-neutral-700 px-2 py-1"
            title={user.email || ""}
          >
            {display}
          </Link>
        ) : (
          <Link
            href="/login"
            className="text-sm rounded-md bg-neutral-900 border border-neutral-700 px-2 py-1"
          >
            Log in / Sign up
          </Link>
        )}
      </div>
    </header>
  );
}
