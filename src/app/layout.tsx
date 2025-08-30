// src/app/layout.tsx
import "./globals.css";
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import SignOutButton from "@/components/SignOutButton"; // <-- add this

export const metadata = {
  title: "Kitchen Biz",
  description: "Back-of-house tools for small restaurants",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  let display = "";
  if (user) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("display_name, tenant_id")
      .eq("id", user.id)
      .maybeSingle();
    display = prof?.display_name || user.email || "";
  }

  return (
    <html lang="en">
      <body>
        <header className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-neutral-800">
          <nav className="flex items-center gap-4">
            <Link href="/" className="font-semibold">Kitchen Biz</Link>
            <Link href="/inventory" className="hover:underline">Inventory</Link>
            <Link href="/recipes" className="hover:underline">Recipes</Link>
            <Link href="/menu" className="hover:underline">Menu</Link>
          </nav>

          {/* Right side: user, Sign out, then Help / FAQ */}
          <nav className="flex items-center gap-4">
            {user ? (
              <>
                <Link href="/profile" className="text-sm opacity-80 hover:opacity-100">{display}</Link>
                <SignOutButton />
              </>
            ) : (
              <Link href="/login" className="rounded border px-3 py-1 hover:bg-neutral-900 text-sm">
                Log in / Sign up
              </Link>
            )}
            <Link href="/help" className="text-sm hover:underline">Help / FAQ</Link>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
