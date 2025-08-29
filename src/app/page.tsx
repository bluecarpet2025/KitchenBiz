import Link from "next/link";
import OptInForm from "@/components/OptInForm";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <main className="max-w-5xl mx-auto p-6">
      {/* Title row with Help/FAQ on the same line (right side) */}
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-3xl font-semibold">Kitchen Biz</h1>
        <div className="flex items-center gap-4">
          <Link href="/help" className="underline">
            Help / FAQ
          </Link>
          <Link href="/profile" className="underline">
            Profile
          </Link>
        </div>
      </div>

      <p className="text-neutral-300 mt-4">
        Simple back-of-house for small restaurants: inventory, recipes, and menu costing.
      </p>

      {/* Big CTAs */}
      <div className="grid md:grid-cols-3 gap-6 mt-6">
        <CTA
          href="/inventory"
          title="Inventory →"
          blurb="Track items, purchases, and daily counts. Inline pricing with $/base auto-calc."
        />
        <CTA
          href="/recipes"
          title="Recipes →"
          blurb='Per-serving costs and “Makeable” based on stock on hand.'
        />
        <CTA
          href="/menu"
          title="Menu →"
          blurb="Build menus, save/load, share read-only links, print."
        />
      </div>

      {/* Roadmap */}
      <section className="mt-10">
        <h2 className="text-xl font-semibold mb-2">Roadmap</h2>
        <ul className="list-disc pl-5 space-y-2 text-neutral-300">
          <li>Prep printable sheet</li>
          <li>Import templates & Google Sheets sync</li>
          <li>Staff roles & vendors</li>
          <li>Polish & empty states</li>
        </ul>
      </section>

      {/* Beta / feedback opt-in */}
      <OptInForm />

      <footer className="mt-12 border-t border-neutral-800 pt-6 text-neutral-400 text-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>© {new Date().getFullYear()} Kitchen Biz</div>
          <nav className="flex gap-6">
            <Link className="underline" href="/privacy">Privacy policy</Link>
            <Link className="underline" href="/terms">Terms of service</Link>
            <a className="underline" href="mailto:bluecarpetllc@gmail.com">Contact us</a>
          </nav>
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
      <div className="text-lg font-semibold">{title}</div>
      <div className="text-neutral-300 mt-2">{blurb}</div>
    </Link>
  );
}
