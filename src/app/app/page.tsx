import Link from "next/link";
import SignupForm from "@/components/SignupForm";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <main className="max-w-5xl mx-auto p-6 space-y-10">
      {/* Hero */}
      <section className="space-y-3">
        <h1 className="text-3xl md:text-4xl font-semibold">Kitchen Biz</h1>
        <p className="text-neutral-300">
          Lightweight tools for small food businesses: inventory, recipes, and menu costing—simple and fast.
        </p>
      </section>

      {/* Big buttons */}
      <section className="grid md:grid-cols-3 gap-3">
        <CTA href="/inventory" title="Inventory" blurb="Track on-hand, purchases, counts & expirations." />
        <CTA href="/recipes" title="Recipes" blurb="Cost ingredients & sub-recipes; scale batches." />
        <CTA href="/menu" title="Menu" blurb="Price items with margin targets & cost visibility." />
      </section>

      {/* Email opt-in */}
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Get early access & share feedback</h2>
        <p className="text-neutral-300 text-sm">
          Want to help shape Kitchen Biz? Join our small beta list. We’ll reach out with testing invites and short feedback forms.
        </p>
        <SignupForm source="landing" />
      </section>

      {/* Roadmap */}
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Roadmap</h2>
        <ul className="list-disc pl-5 space-y-1 text-neutral-300 text-sm">
          <li><strong>Now:</strong> Inventory & Recipes MVP (counts, receipts, cost & value)</li>
          <li>Menu item costing & margin targets</li>
          <li>CSV import/export across modules</li>
          <li>Multi-location support & roles</li>
          <li>Help panels on each page (contextual, bite-sized)</li>
        </ul>
      </section>

      {/* Footer */}
      <footer className="pt-6 mt-6 border-t text-sm text-neutral-300">
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
      className="rounded-lg border p-4 hover:bg-neutral-900 transition-colors"
    >
      <div className="text-lg font-semibold">{title}</div>
      <div className="text-sm opacity-80 mt-1">{blurb}</div>
    </Link>
  );
}
