// src/app/page.tsx
import Link from "next/link";
import SignupForm from "@/components/SignupForm";
import GoogleSignIn from "@/components/GoogleSignIn";

function CTA({
  href, title, blurb,
}: { href: string; title: string; blurb: string; }) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-neutral-800 p-4 hover:bg-neutral-900 transition-colors block"
    >
      <div className="text-lg font-semibold">{title} →</div>
      <div className="text-sm opacity-80 mt-1">{blurb}</div>
    </Link>
  );
}

export default function HomePage() {
  return (
    <>
      <h1 className="text-3xl font-semibold mb-2">Kitchen Biz</h1>
      <p className="opacity-80 mb-6">
        Simple back-of-house for small restaurants: inventory, recipes, and menu costing.
      </p>

      <div className="grid gap-4 sm:grid-cols-3">
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
      </div>

      {/* Auth / signup card */}
      <section className="mt-10 grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-neutral-800 p-4">
          <div className="font-semibold mb-2">Try it</div>
          <p className="text-sm opacity-80 mb-4">
            Use your email for a one-time magic link or continue with Google.
          </p>
          <div className="flex flex-col gap-3">
            <SignupForm />
            <GoogleSignIn />
          </div>
        </div>

        <div className="rounded-lg border border-neutral-800 p-4">
          <div className="font-semibold mb-2">Roadmap</div>
          <ul className="list-disc pl-5 space-y-2 text-sm">
            <li>Prep printable sheet</li>
            <li>Import templates & Google Sheets sync</li>
            <li>Staff roles & vendors</li>
            <li>Polish & empty states</li>
          </ul>
        </div>
      </section>
    </>
  );
}
