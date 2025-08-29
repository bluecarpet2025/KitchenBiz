// src/app/page.tsx
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="max-w-5xl mx-auto p-6">
      <h1 className="text-3xl font-semibold">Kitchen Biz</h1>
      <p className="mt-3 text-neutral-300">
        Simple back-of-house for small restaurants: inventory, recipes, and menu costing.
      </p>

      <section className="grid md:grid-cols-3 gap-4 mt-6">
        <CTA
          href="/inventory"
          title="Inventory →"
          blurb="Track items, purchases, and daily counts. Inline pricing with $/base auto-calc."
        />
        <CTA
          href="/recipes"
          title="Recipes →"
          blurb="Per-serving costs and “Makeable” based on stock on hand."
        />
        <CTA
          href="/menu"
          title="Menu →"
          blurb="Build menus, save/load, share read-only links, print."
        />
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Roadmap</h2>
        <ul className="list-disc pl-5 space-y-1 mt-3 text-neutral-300">
          <li>Prep printable sheet</li>
          <li>Import templates & Google Sheets sync</li>
          <li>Staff roles & vendors</li>
          <li>Polish & empty states</li>
        </ul>
      </section>

      <footer className="pt-6 mt-10 border-t text-sm text-neutral-300">
        <div className="flex flex-col md:flex-row gap-2 md:items-center md:justify-between">
          <div>© {new Date().getFullYear()} Kitchen Biz</div>
          <nav className="flex gap-4">
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
      className="rounded-lg border p-4 hover:bg-neutral-900 transition-colors block"
    >
      <div className="text-lg font-semibold">{title}</div>
      <div className="text-sm opacity-80 mt-1">{blurb}</div>
    </Link>
  );
}
