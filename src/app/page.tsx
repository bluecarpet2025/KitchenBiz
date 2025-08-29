import Link from "next/link";
import OptInForm from "@/components/OptInForm";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <main className="max-w-6xl mx-auto p-6">
      <h1 className="text-2xl font-semibold">Kitchen Biz</h1>
      <p className="mt-3 text-neutral-300">
        Simple back-of-house for small restaurants: inventory, recipes, and menu costing.
      </p>

      {/* Big buttons */}
      <section className="mt-6 grid md:grid-cols-3 gap-4">
        <CTA href="/inventory" title="Inventory →"
             blurb="Track items, purchases, and daily counts. Inline pricing with $/base auto-calc." />
        <CTA href="/recipes" title="Recipes →"
             blurb="Per-serving costs and “Makeable” based on stock on hand." />
        <CTA href="/menu" title="Menu →"
             blurb="Build menus, save/load, share read-only links, print." />
      </section>

      {/* Roadmap */}
      <section className="mt-10">
        <h2 className="text-xl font-semibold mb-2">Roadmap</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Prep printable sheet</li>
          <li>Import templates & Google Sheets sync</li>
          <li>Staff roles & vendors</li>
          <li>Polish & empty states</li>
        </ul>
      </section>

      {/* Opt-in */}
      <OptInForm />

      {/* Footer */}
      <footer className="pt-10 text-sm text-neutral-400">
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-6">
          <Link className="underline" href="/privacy">Privacy policy</Link>
          <Link className="underline" href="/terms">Terms of service</Link>
          <a className="underline" href="mailto:bluecarpetllc@gmail.com">Contact us</a>
        </div>
        <div className="mt-4">© {new Date().getFullYear()} Kitchen Biz</div>
      </footer>
    </main>
  );
}

function CTA({ href, title, blurb }: { href: string; title: string; blurb: string }) {
  return (
    <Link href={href} className="rounded-xl border border-neutral-800 p-5 hover:bg-neutral-900 transition-colors">
      <div className="text-lg font-semibold">{title}</div>
      <div className="text-neutral-300 text-sm mt-1">{blurb}</div>
    </Link>
  );
}
