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
        <p className="inline-flex items-center gap-2 rounded-full border border-emerald-600/60 bg-emerald-900/20 px-3 py-1 text-xs font-medium text-emerald-300">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          Beta • Core features ready • Starter is free while we collect feedback
        </p>

        <h1 className="mt-4 text-4xl font-semibold tracking-tight">Kiori Solutions</h1>

        <p className="mt-3 text-neutral-300 leading-relaxed max-w-3xl">
          Back-of-house tools for small kitchens: inventory, recipes, menu costing, sales &amp; expenses, and a built-in
          dashboard. Designed for owner-operators who want numbers they can trust without hiring a data team.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          {user ? (
            <CTAButton href="/dashboard" label="Go to dashboard" />
          ) : (
            <>
              <CTAButton href="/login" label="Start free • Sign in / Create account" />
              <GhostButton href="/menu" label="View live demo menu →" />
            </>
          )}
          <GhostButton href="/help" label="How it works" />
        </div>

        <p className="mt-3 text-xs text-neutral-400 max-w-2xl">
          No credit card required for the Starter plan during beta. If you find a bug or something feels confusing,
          you&apos;re helping shape the product—just let us know and we&apos;ll fix it as soon as possible.
        </p>
      </section>

      {/* Feature tiles */}
      <section className="mt-6">
        <h2 className="text-xl font-semibold">What’s inside right now</h2>
        <p className="mt-2 text-sm text-neutral-400 max-w-3xl">
          All of these modules are wired together for a single tenant: import your data once and see it reflected across
          recipes, menu pricing, and the dashboard.
        </p>

        <div className="grid md:grid-cols-3 gap-6 mt-4">
          <CTACard
            href="/inventory"
            title="Inventory →"
            blurb="Track items, purchases, and daily counts. Cost-per-base-unit auto-calculated from your last price."
          />
          <CTACard
            href="/recipes"
            title="Recipes →"
            blurb="Per-serving cost and Makeable count based on stock on hand, including sub-recipes."
          />
          <CTACard
            href="/menu"
            title="Menu builder →"
            blurb="Build menus from recipes, set margins, round prices, save/load versions, and print or share read-only links."
          />
          <CTACard href="/sales" title="Sales →" blurb="Import sales CSVs and see day / week / month totals in one place." />
          <CTACard
            href="/expenses"
            title="Expenses →"
            blurb="Log or import expenses. Category and time-period totals feed straight into the dashboard."
          />
          <CTACard
            href="/staff/manage"
            title="Staff →"
            blurb="Manage staff accounts, schedules, and payroll (Pro plan and up)."
          />
        </div>
      </section>

      {/* Plans snapshot */}
      <section className="mt-10">
        <h2 className="text-xl font-semibold">Plans &amp; tiers (beta snapshot)</h2>
        <p className="mt-2 text-sm text-neutral-400 max-w-3xl">
          Pricing and limits are still in motion, but this is the working model we&apos;re testing with early users. You
          can start on Starter and upgrade later—your data comes with you.
        </p>

        <div className="mt-4 grid gap-4 md:grid-cols-4 text-sm">
          {/* Starter */}
          <div className="rounded-lg border border-neutral-800 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Starter</div>
            <div className="mt-1 text-lg font-semibold">$0 / month</div>
            <ul className="mt-3 space-y-1 text-xs text-neutral-300">
              <li>• 1 location</li>
              <li>• Inventory, Recipes, Menu, Sales, Expenses</li>
              <li>• Up to 3 months of history</li>
              <li>• Manual data entry only (no photos)</li>
            </ul>
          </div>

          {/* Basic */}
          <div className="rounded-lg border border-emerald-700 p-4 bg-emerald-900/10">
            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-300">Basic</div>
            <div className="mt-1 text-lg font-semibold">$49 / month</div>
            <ul className="mt-3 space-y-1 text-xs text-neutral-200">
              <li>• Everything in Starter</li>
              <li>• Unlimited history</li>
              <li>• Receipt photo upload</li>
              <li>• Trend views &amp; PDF/CSV exports</li>
            </ul>
          </div>

          {/* Pro */}
          <div className="rounded-lg border border-neutral-800 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Pro</div>
              <span className="text-[10px] px-2 py-1 rounded-full border border-neutral-700 text-neutral-300">
                AI coming soon
              </span>
            </div>
            <div className="mt-1 text-lg font-semibold">$99 / month</div>
            <ul className="mt-3 space-y-1 text-xs text-neutral-300">
              <li>• Everything in Basic</li>
              <li>• Staff module (accounts, schedules, payroll)</li>
              <li>
                • AI analytics &amp; suggestions{" "}
                <span className="text-neutral-400">(coming soon)</span>
              </li>
              <li>• Custom branding &amp; POS integration</li>
            </ul>
          </div>

          {/* Enterprise */}
          <div className="rounded-lg border border-neutral-800 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Enterprise</div>
              <span className="text-[10px] px-2 py-1 rounded-full border border-neutral-700 text-neutral-300">
                Coming soon
              </span>
            </div>
            <div className="mt-1 text-lg font-semibold">$499 / month</div>
            <ul className="mt-3 space-y-1 text-xs text-neutral-300">
              <li>
                • Only if there’s interest{" "}
                <span className="text-neutral-400">(waitlist)</span>
              </li>
              <li>• Unlimited locations &amp; users</li>
              <li>• White-label dashboard &amp; custom domain</li>
              <li>• API access &amp; custom integrations</li>
            </ul>
          </div>
        </div>

        {/* Add-ons snapshot */}
        <div className="mt-6 rounded-xl border border-neutral-800 p-5">
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-sm font-semibold">Add-ons</h3>
            <span className="text-[10px] px-2 py-1 rounded-full border border-neutral-700 text-neutral-300">
              Coming soon
            </span>
          </div>

          <p className="mt-2 text-sm text-neutral-400 max-w-3xl">
            Optional add-ons — great if you want a lightweight POS or deeper AI insights. If you already have a POS, you
            can skip these.
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-2 text-sm">
            <div className="rounded-lg border border-neutral-800 p-4">
              <div className="font-medium">POS add-on — $50 / month</div>
              <div className="text-xs text-neutral-400 mt-1">
                Basic checkout + items + simple daily totals. Designed for small operators who don’t want a heavy POS.
              </div>
              <div className="text-xs text-neutral-500 mt-2">
                Coming soon • Join the waitlist by emailing{" "}
                <a className="underline" href="mailto:support@kiorisolutions.com">
                  support@kiorisolutions.com
                </a>
                .
              </div>
            </div>

            <div className="rounded-lg border border-neutral-800 p-4">
              <div className="font-medium">AI Deep Business Report — $49 (one-time)</div>
              <div className="text-xs text-neutral-400 mt-1">
                A deep dive on trends + opportunities using your real numbers. Available for Basic+.
              </div>
              <div className="text-xs text-neutral-500 mt-2">Coming soon • AI is rolling out in stages.</div>
            </div>
          </div>
        </div>
      </section>

      {/* Dashboard teaser */}
      <section className="mt-10">
        <h2 className="text-xl font-semibold">Built-in dashboard</h2>
        <ul className="list-disc pl-5 mt-3 space-y-2 text-neutral-300">
          <li>Sales &amp; expenses cards for daily, weekly, monthly, and year-to-date.</li>
          <li>Time-bucketed tables (day / ISO week / month / quarter / year) that match the UI labels.</li>
          <li>Top / bottom products and expense categories so you know what&apos;s driving your numbers.</li>
        </ul>
        <div className="mt-4">
          <GhostButton href="/dashboard" label="Open dashboard" />
        </div>
      </section>

      {/* Beta status */}
      <section className="mt-10">
        <h2 className="text-xl font-semibold">What “beta” means here</h2>
        <ul className="list-disc pl-5 mt-3 space-y-2 text-neutral-300">
          <li>Core flows are stable: Inventory → Recipes → Menu → Sales &amp; Expenses → Dashboard.</li>
          <li>Some screens are still rough around the edges (copy / spacing / visuals).</li>
          <li>AI reports, deeper staff tools, and multi-location features are on the roadmap and will arrive tiered by plan.</li>
          <li>If something breaks, you&apos;ll see a clear error and we&apos;ll treat your report as a top priority.</li>
        </ul>
      </section>

      {/* Footer */}
      <footer className="pt-10 pb-6 text-sm text-neutral-400">
        <div className="flex flex-wrap gap-5">
          <Link href="/privacy" className="underline">
            Privacy policy
          </Link>
          <Link href="/terms" className="underline">
            Terms of service
          </Link>
          <a href="mailto:support@kiorisolutions.com" className="underline">
            Contact us
          </a>
        </div>
        <div className="mt-4">© {new Date().getFullYear()} Kiori Solutions</div>
      </footer>
    </main>
  );
}

function CTACard({ href, title, blurb }: { href: string; title: string; blurb: string }) {
  return (
    <Link href={href} className="block rounded-xl border border-neutral-800 p-5 hover:bg-neutral-900">
      <div className="text-lg font-semibold">{title}</div>
      <div className="text-sm opacity-80 mt-1">{blurb}</div>
    </Link>
  );
}

function CTAButton({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2 rounded-xl border border-neutral-700 px-4 py-2 hover:bg-neutral-900">
      <span className="font-medium">{label}</span>
      <ArrowRightIcon />
    </Link>
  );
}

function GhostButton({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-neutral-300 underline-offset-4 hover:underline">
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
