// src/app/layout.tsx
import "./globals.css";
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Kitchen Biz",
  description: "Simple back-of-house for small restaurants",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  // load display name (fallback to email)
  let displayName: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .single();
    displayName = profile?.display_name ?? user.email ?? null;
  }

  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-950 text-neutral-100">
        <header className="border-b border-neutral-800">
          <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <div className="flex items-center gap-6">
              <Link href="/" className="font-semibold text-lg">Kitchen Biz</Link>
              <Link href="/inventory" className="hover:underline">Inventory</Link>
              <Link href="/recipes" className="hover:underline">Recipes</Link>
              <Link href="/menu" className="hover:underline">Menu</Link>
            </div>
            <div className="flex items-center gap-6">
              <Link href="/help" className="hover:underline">Help / FAQ</Link>
              {user ? (
                <Link href="/settings" className="text-sm opacity-80 hover:opacity-100">
                  {displayName}
                </Link>
              ) : (
                <Link href="/login" className="text-sm underline">Log in / Sign up</Link>
              )}
            </div>
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 py-10 text-sm text-neutral-400">
          <div className="border-t border-neutral-800 pt-6 flex items-center justify-between">
            <div>© {new Date().getFullYear()} Kitchen Biz</div>
            <div className="flex gap-6">
              <Link href="/privacy" className="underline">Privacy policy</Link>
              <Link href="/terms" className="underline">Terms of service</Link>
              <a className="underline" href="mailto:bluecarpetllc@gmail.com">Contact us</a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
