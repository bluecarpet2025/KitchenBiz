// src/components/TopNav.tsx
export const dynamic = "force-dynamic";

import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";

export default async function TopNav() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let displayName: string | null = null;
  if (user) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();
    displayName = prof?.display_name ?? user.email ?? null;
  }

  return (
    <header className="border-b border-neutral-900/60">
      <nav className="max-w-6xl mx-auto flex items-center justify-between gap-4 px-4 py-3">
        {/* Left: brand + sections */}
        <div className="flex items-center gap-6">
          <Link href="/" className="font-semibold">Kitchen Biz</Link>
          <Link href="/inventory" className="hover:underline">Inventory</Link>
          <Link href="/recipes" className="hover:underline">Recipes</Link>
          <Link href="/menu" className="hover:underline">Menu</Link>
        </div>

        {/* Right: user first, then Help / FAQ (swapped order) */}
        <div className="flex items-center gap-4">
          {displayName ? (
            <span className="text-sm text-neutral-200">{displayName}</span>
          ) : (
            <Link href="/login" className="text-sm underline">
              Log in / Sign up
            </Link>
          )}
          <Link href="/help" className="text-sm hover:underline">Help / FAQ</Link>
        </div>
      </nav>
    </header>
  );
}
