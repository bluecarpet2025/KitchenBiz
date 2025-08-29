// src/app/page.tsx
import Link from "next/link";
import OptInForm from "@/components/OptInForm";

function CTA({
  href,
  title,
  blurb,
}: {
  href: string;
  title: string;
  blurb: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-lg border p-4 hover:bg-neutral-900 transition-colors block"
    >
      <div className="text-lg font-semibold">{title} →</div>
      <div className="text-sm opacity-80 mt-1">{blurb}</div>
    </Link>
  );
}

export default function HomePage() {
  return (
    <main className="max-w-5xl mx-auto p-6 space-y-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">Kitchen Biz</h1>
        <p className="text-neutral-300">
          Simple back-of-house for small restaurants: inventory, recipes, and
          menu costing.
        </p>
        <div>
          <Link href="/help" className="underline">
            Help / FAQ
          </Link>
        </div>
      </header>

      <section className="grid gap-6 sm:grid-cols-3">
        <CTA
          href="/inventory"
          title="Inventory"
          blurb="Track items, purchases, and daily counts. Inline pricing with $/base auto-calc."
        />
        <CTA
          href="/recipes"
          title="Recipes"
          blurb='Per-serving costs and “Makeable” based on stock on hand.'
        />
        <CTA
          href="/menu"
          title="Menu"
          blurb="Build menus, save/load, share read-only links, print."
        />
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-3">Roadmap</h2>
        <ul className="list-disc pl-5 space-y-2 text-neutral-200">
          <li>Prep printable sheet</li>
          <li>Import templates & Google Sheets sync</li>
          <li>Staff roles & vendors</li>
          <li>Polish & empty states</li>
        </ul>
      </section>

      {/* Beta opt-in stays ONLY on the landing page */}
      <OptInForm />
    </main>
  );
}
