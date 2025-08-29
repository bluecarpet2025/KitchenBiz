// src/app/page.tsx
import Link from "next/link";
import OptInForm from "@/components/OptInForm";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="max-w-5xl mx-auto px-5 py-10">
      <header className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-semibold">Kitchen Biz</h1>

        <nav className="flex items-center gap-4 text-sm">
          <Link href="/help" className="underline">
            Help / FAQ
          </Link>

          {user ? (
            <>
              <Link href="/profile" className="underline">
                Profile
              </Link>
              <span className="opacity-80">{user.email}</span>
              <form action="/logout" method="post">
                <button className="underline">Sign out</button>
              </form>
            </>
          ) : (
            <Link href="/login" className="underline">
              Log in / Sign up
            </Link>
          )}
        </nav>
      </header>

      <p className="text-neutral-300 mb-8">
        Simple back-of-house for small restaurants: inventory, recipes, and menu costing.
      </p>

      <section className="grid md:grid-cols-3 gap-5">
        <CTA href="/inventory" title="Inventory →" blurb="Track items, purchases, and daily counts. Inline pricing with $/base auto-calc." />
        <CTA href="/recipes" title="Recipes →" blurb='Per-serving costs and “Makeable” based on stock on hand.' />
        <CTA href="/menu" title="Menu →" blurb="Build menus, save/load, share read-only links, print." />
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold mb-3">Roadmap</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Prep printable sheet</li>
          <li>Import templates & Google Sheets sync</li>
          <li>Staff roles & vendors</li>
          <li>Polish & empty states</li>
        </ul>
      </section>

      {/* Beta opt-in / feedback */}
      <OptInForm />
      <footer className="mt-12 text-sm text-neutral-400 flex items-center justify-between">
        <span>© {new Date().getFullYear()} Kitchen Biz</span>
        <div className="flex gap-4">
          <Link href="/privacy" className="underline">
            Privacy policy
          </Link>
          <Link href="/terms" className="underline">
            Terms of service
          </Link>
          <Link href="mailto:bluecarpetllc@gmail.com" className="underline">
            Contact us
          </Link>
        </div>
      </footer>
    </main>
  );
}

function CTA({ href, title, blurb }: { href: string; title: string; blurb: string }) {
  return (
    <Link
      href={href}
      className="block rounded-xl border border-neutral-800 p-5 hover:bg-neutral-900 transition-colors"
    >
      <div className="text-lg font-semibold mb-2">{title}</div>
      <div className="text-sm opacity-80">{blurb}</div>
    </Link>
  );
}
