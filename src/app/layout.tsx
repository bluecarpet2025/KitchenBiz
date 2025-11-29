import "./globals.css";
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import SignOutButton from "@/components/SignOutButton";
import TopNavButton from "@/components/TopNavButton";

export const metadata = {
  title: "Kiori Solutions",
  description: "Smart kitchen management tools for food entrepreneurs",
  openGraph: {
    title: "Kiori Solutions",
    description: "Smart kitchen management tools for food entrepreneurs",
    url: "https://kiiorisolutions.com",
    siteName: "Kiori Solutions",
  },
  twitter: {
    card: "summary_large_image",
    title: "Kiori Solutions",
    description: "Smart kitchen management tools for food entrepreneurs",
  },
  icons: {
    icon: "/kiori-icon-32.png",                 // browser tab
    shortcut: "/kiori-favicon.ico",             // legacy fallback
    apple: "/kiori-apple-touch-icon.png",       // iOS home screen
    other: [
      {
        rel: "mask-icon",
        url: "/kiori-maskable-icon-512.png",    // Android / PWA maskable icon
      },
    ],
  },
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
        {/* Sticky Header (visible while scrolling) */}
        <header
          data-kb-topnav
          className="print:hidden sticky top-0 z-50 flex items-center justify-between px-4 sm:px-6 py-3 border-b border-neutral-800 bg-neutral-950/90 backdrop-blur supports-[backdrop-filter]:bg-neutral-950/75"
        >
          <nav className="flex items-center gap-4">
            <Link href="/" className="font-semibold">Kiori Solutions</Link>

            {/* ORDER: Inventory | Recipes | Menu | Financials | Staff | Dashboard */}
            <Link href="/inventory" className="hover:underline">Inventory</Link>
            <Link href="/recipes" className="hover:underline">Recipes</Link>
            <Link href="/menu" className="hover:underline">Menu</Link>
            <Link href="/financial" className="hover:underline">Financials</Link>
            <Link href="/staff" className="hover:underline">Staff</Link>
            <Link href="/dashboard" className="hover:underline">Dashboard</Link>
          </nav>

          <nav className="flex items-center gap-4">
            {user ? (
              <>
                <Link
                  href="/profile"
                  className="text-sm opacity-80 hover:opacity-100"
                >
                  {display}
                </Link>
                <SignOutButton />
              </>
            ) : (
              <Link
                href="/login"
                className="rounded border px-3 py-1 hover:bg-neutral-900 text-sm"
              >
                Log in / Sign up
              </Link>
            )}

            {/* Shared button component for Help / FAQ */}
            <TopNavButton href="/help" label="Help / FAQ" />
          </nav>
        </header>

        {children}
      </body>
    </html>
  );
}
