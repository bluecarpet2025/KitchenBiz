// src/app/page.tsx
import Link from "next/link";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <main className="max-w-5xl mx-auto p-6">
      <h1 className="text-3xl font-semibold">Kitchen Biz</h1>
      <p className="mt-2 text-neutral-300">
        Simple back-of-house for small restaurants: inventory, recipes, and menu costing.
      </p>

      <div className="grid md:grid-cols-3 gap-6 mt-6">
        <CTA href="/inventory" title="Inventory →"
             blurb="Track items, purchases, and daily counts. Inline pricing with $/base auto-calc." />
        <CTA href="/recipes" title="Recipes →"
             blurb="Per-serving costs and “Makeable” based on stock on hand." />
        <CTA href="/menu" title="Menu →"
             blurb="Build menus, save/load, share read-only links, print." />
      </div>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Roadmap</h2>
        <ul className="list-disc pl-5 mt-3 space-y-2">
          <li>Prep printable sheet</li>
          <li>Import templates & Google Sheets sync</li>
          <li>Staff roles & vendors</li>
          <li>Polish & empty states</li>
        </ul>
      </section>

      <footer className="pt-10 text-sm text-neutral-400">
        <div className="flex gap-5">
          <Link href="/privacy" className="underline">Privacy policy</Link>
          <Link href="/terms" className="underline">Terms of service</Link>
          <a href="mailto:bluecarpetllc@gmail.com" className="underline">Contact us</a>
        </div>
        <div className="mt-4">© {new Date().getFullYear()} Kitchen Biz</div>
      </footer>
    </main>
  );
}

function CTA({ href, title, blurb }: { href: string; title: string; blurb: string }) {
  return (
    <Link href={href} className="block rounded-xl border border-neutral-800 p-5 hover:bg-neutral-900">
      <div className="text-lg font-semibold">{title}</div>
      <div className="text-sm opacity-80 mt-1">{blurb}</div>
    </Link>
  );
}
