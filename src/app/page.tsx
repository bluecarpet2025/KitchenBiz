// src/app/page.tsx
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="max-w-5xl mx-auto p-6">
      {/* Hero */}
      <section className="pt-6 pb-8">
        <h1 className="text-4xl font-semibold tracking-tight">Kitchen Biz</h1>
        <p className="mt-3 text-neutral-300 leading-relaxed max-w-3xl">
          Simple back-of-house for small restaurants: inventory, purchases,
          recipes, menu costing, and sales &amp; expenses tracking. Built to make
          day-to-day kitchen math obvious—so owners can price confidently.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          {user ? (
            <CTAButton href="/dashboard" label="Go to dashboard" />
          ) : (
            <>
              <CTAButton href="/login" label="Sign in / Create account" />
              <GhostButton href="/menu" label="View demo: Menu →" />
            </>
          )}
          <GhostButton href="/help" label="How it works" />
        </div>
      </section>

      {/* Feature tiles */}
      <section className="mt-6">
        <h2 className="text-xl font-semibold">What’s inside</h2>
        <div className="grid md:grid-cols-3 gap-6 mt-4">
          <CTACard
            href="/inventory"
            title="Inventory →"
            blurb="Track items, purchases, and daily counts. Inline $/base auto-calc."
          />
          <CTACard
            href="/recipes"
            title="Recipes →"
            blurb="Per-serving costs and “Makeable” based on stock on hand."
          />
          <CTACard
            href="/menu"
            title="Menu →"
            blurb="Build menus, save/load, share read-only links, and print."
          />
          <CTACard
            href="/sales"
            title="Sales →"
            blurb="Import sales CSVs and see day/week/month/quarter/year totals."
          />
          <CTACard
            href="/expenses"
            title="Expenses →"
            blurb="Log or import expenses. Category totals feed the dashboard."
          />
          <CTACard
            href="/staff/manage"
            title="Staff →"
            blurb="Keep a simple roster for exports and admin tasks."
          />
        </div>
      </section>

      {/* Dashboard teaser */}
      <section className="mt-10">
        <h2 className="text-xl font-semibold">Built-in dashboard</h2>
        <ul className="list-disc pl-5 mt-3 space-y-2 text-neutral-300">
          <li>Sales &amp; expenses cards: daily, weekly, monthly, YTD.</li>
          <li>7-day mini tables for quick trend checks.</li>
          <li>ISO week, YYYY-MM, and YYYY labels—exact view names expected by the UI.</li>
        </ul>
        <div className="mt-4">
          <GhostButton href="/dashboard" label="Open dashboard" />
        </div>
      </section>

      {/* Roadmap */}
      <section className="mt-10">
        <h2 className="text-xl font-semibold">Near-term polish</h2>
        <ul className="list-disc pl-5 mt-3 space-y-2">
          <li>Copy &amp; empty-states cleanup across pages.</li>
          <li>Consistent money/qty/date formatting.</li>
          <li>Import flows: clearer errors and template parity.</li>
          <li>Optional color/theme refresh (without structural changes).</li>
        </ul>
      </section>

      {/* Footer */}
      <footer className="pt-10 pb-6 text-sm text-neutral-400">
        <div className="flex flex-wrap gap-5">
          <Link href="/privacy" className="underline">Privacy policy</Link>
          <Link href="/terms" className="underline">Terms of service</Link>
          <a href="mailto:bluecarpetllc@gmail.com" className="underline">Contact us</a>
        </div>
        <div className="mt-4">© {new Date().getFullYear()} Kitchen Biz</div>
      </footer>
    </main>
  );
}

function CTACard({
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
      className="block rounded-xl border border-neutral-800 p-5 hover:bg-neutral-900"
    >
      <div className="text-lg font-semibold">{title}</div>
      <div className="text-sm opacity-80 mt-1">{blurb}</div>
    </Link>
  );
}

function CTAButton({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 rounded-xl border border-neutral-700 px-4 py-2 hover:bg-neutral-900"
    >
      <span className="font-medium">{label}</span>
      <ArrowRightIcon />
    </Link>
  );
}

function GhostButton({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-neutral-300 underline-offset-4 hover:underline"
    >
      <span>{label}</span>
    </Link>
  );
}

function ArrowRightIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      {...props}
    >
      <path d="M5 12h14" />
      <path d="M13 5l7 7-7 7" />
    </svg>
  );
}
