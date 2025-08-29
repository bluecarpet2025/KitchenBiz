import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";

export default async function TopNav() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  let label = "Log in";
  let profileHref = "/login";

  if (user) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("display_name, use_demo")
      .eq("id", user.id)
      .single();

    label = prof?.display_name || user.email || "Account";
    profileHref = "/profile";
  }

  return (
    <header className="border-b border-neutral-800">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-semibold">Kitchen Biz</Link>
          <nav className="hidden sm:flex items-center gap-4 text-sm">
            <Link href="/inventory" className="opacity-90 hover:opacity-100">Inventory</Link>
            <Link href="/recipes"   className="opacity-90 hover:opacity-100">Recipes</Link>
            <Link href="/menu"      className="opacity-90 hover:opacity-100">Menu</Link>
          </nav>
        </div>

        <div className="text-right">
          <div className="text-sm">{label}</div>
          <div className="text-xs mt-1 flex gap-3 justify-end">
            <Link href="/help" className="underline opacity-80 hover:opacity-100">Help / FAQ</Link>
            <Link href={profileHref} className="underline opacity-80 hover:opacity-100">Profile</Link>
          </div>
        </div>
      </div>
    </header>
  );
}
