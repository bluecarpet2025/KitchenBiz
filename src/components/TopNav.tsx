import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";

export default async function TopNav() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-neutral-900">
      <nav className="flex items-center gap-6">
        <Link href="/" className="font-semibold">Kitchen Biz</Link>
        <Link href="/inventory">Inventory</Link>
        <Link href="/recipes">Recipes</Link>
        <Link href="/menu">Menu</Link>
      </nav>

      <div className="flex items-center gap-4">
        <Link href="/help" className="underline">Help / FAQ</Link>
        {user ? (
          <Link href="/profile" className="text-sm opacity-80 hover:opacity-100">
            {user.email}
          </Link>
        ) : (
          <Link href="/login" className="underline">Log in / Sign up</Link>
        )}
      </div>
    </header>
  );
}
