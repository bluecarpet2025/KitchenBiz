// src/app/help/page.tsx
export const dynamic = "force-dynamic";

function A(props: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...props} className="underline" />;
}

export default function Help() {
  return (
    <main className="max-w-4xl mx-auto p-6 space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Help / FAQ & Instructions</h1>
        <p className="text-sm text-neutral-300 mt-2">
          This guide explains how each part of Kiori Solutions works and how your data flows between modules. We’re currently in{" "}
          <strong>beta</strong> — core features are stable, but visuals and copy may still evolve. If something feels off, you’re helping us
          shape the product.
        </p>
      </header>

      {/* Inventory */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Inventory</h2>
        <p className="text-sm text-neutral-300">
          Inventory is the backbone of accurate recipe costs and menu pricing. Every item auto-calculates a base-unit cost from your purchase
          history.
        </p>
        <ul className="list-disc ml-6 text-sm text-neutral-300 space-y-1">
          <li>
            Items list: <A href="/inventory">/inventory</A>. Create new items: <A href="/inventory/items/new">/inventory/items/new</A>.
          </li>
          <li>
            Purchases: record vendor invoices at <A href="/inventory/purchase">/inventory/purchase</A>. This updates stock on hand and price
            history.
          </li>
          <li>
            Daily counts: start at <A href="/inventory/counts/new">/inventory/counts/new</A>. After entering quantities, press <em>Commit</em>{" "}
            to create adjustments.
          </li>
          <li>
            CSV import: <A href="/inventory/import">/inventory/import</A>. Use the included template.
          </li>
        </ul>

        <FAQ
          q="Makeable shows 0 — how do I fix it?"
          a={
            <>
              Makeable depends entirely on your stock ledger. Record a <A href="/inventory/purchase">Purchase</A> or{" "}
              <A href="/inventory/counts/new">Count</A>.
            </>
          }
        />
      </section>

      {/* Recipes */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Recipes</h2>
        <p className="text-sm text-neutral-300">
          Recipes calculate cost per serving based on your Inventory base-unit costs. Sub-recipes are supported and expand into their base
          ingredients automatically.
        </p>
        <ul className="list-disc ml-6 text-sm text-neutral-300 space-y-1">
          <li>
            Manage recipes: <A href="/recipes">/recipes</A>.
          </li>
          <li>
            Create new: <A href="/recipes/new">/recipes/new</A>.
          </li>
          <li>Add ingredients and quantities. Costs update live.</li>
          <li>“Makeable” shows how many you can prep now using your current stock.</li>
        </ul>
      </section>

      {/* Menu */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Menu</h2>
        <p className="text-sm text-neutral-300">
          The Menu Builder combines your recipes with your target margins to suggest pricing, rounding, and menu versions you can save and load.
        </p>
        <ul className="list-disc ml-6 text-sm text-neutral-300 space-y-1">
          <li>
            Build menus: <A href="/menu">/menu</A>.
          </li>
          <li>Save multiple menus, print them, or share read-only links.</li>
          <li>Suggested price = (recipe cost ÷ target margin) with automatic rounding.</li>
        </ul>
      </section>

      {/* Sales */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Sales</h2>
        <p className="text-sm text-neutral-300">
          Import sales CSVs and track performance over any time period. Dashboard uses the same tables so everything stays in sync.
        </p>
        <ul className="list-disc ml-6 text-sm text-neutral-300 space-y-1">
          <li>
            View sales: <A href="/sales">/sales</A>. Import CSV: <A href="/sales/import">/sales/import</A>.
          </li>
          <li>
            Sales imports generate both <code>sales_orders</code> and <code>sales_order_lines</code>.
          </li>
          <li>
            Time-bucketed calculations come from <code>v_sales_*_totals</code>.
          </li>
        </ul>
      </section>

      {/* Expenses */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Expenses</h2>
        <p className="text-sm text-neutral-300">
          Log or import expenses to complete your Profit &amp; Loss picture. These totals feed directly into the dashboard.
        </p>
        <ul className="list-disc ml-6 text-sm text-neutral-300 space-y-1">
          <li>
            Expense list: <A href="/expenses">/expenses</A>. CSV import: <A href="/expenses/import">/expenses/import</A>.
          </li>
          <li>
            Required columns: <code>date</code>, <code>category</code>, <code>description</code>, <code>amount</code>.
          </li>
        </ul>
      </section>

      {/* Staff */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Staff</h2>
        <p className="text-sm text-neutral-300">
          Staff tools help you keep a roster and track schedules and payroll totals. Staff is available on the <strong>Pro</strong> plan.
        </p>
        <ul className="list-disc ml-6 text-sm text-neutral-300 space-y-1">
          <li>
            Manage: <A href="/staff/manage">/staff/manage</A>.
          </li>
          <li>
            Schedule: <A href="/staff/schedule">/staff/schedule</A>.
          </li>
        </ul>
      </section>

      {/* Dashboard */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Dashboard</h2>
        <p className="text-sm text-neutral-300">
          Your Sales &amp; Expenses summarized across multiple timeframes: daily, weekly, monthly, quarterly, and year-to-date.
        </p>
        <ul className="list-disc ml-6 text-sm text-neutral-300 space-y-1">
          <li>
            Views must exist: <code>v_sales_*_totals</code>, <code>v_expense_*_totals</code>.
          </li>
          <li>
            Required columns: <code>revenue</code> (sales) and <code>total</code> (expenses).
          </li>
          <li>
            Time labels: <code>day</code>, <code>week</code> (IYYY-WIW), <code>month</code> (YYYY-MM), <code>year</code>.
          </li>
        </ul>
      </section>

      {/* CSV & Troubleshooting */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">CSV templates & troubleshooting</h2>
        <p className="text-sm text-neutral-300">
          All Import pages include a downloadable template matched to your tenant’s structure. Importers ignore extra columns safely.
        </p>
        <ul className="list-disc ml-6 text-sm text-neutral-300 space-y-1">
          <li>
            Dates must be <code>YYYY-MM-DD</code>.
          </li>
          <li>
            Amounts must be numeric — no <code>$</code> signs.
          </li>
          <li>Check toast errors for specific rows and messages.</li>
        </ul>
      </section>

      {/* FAQ */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">FAQ</h2>

        <FAQ q="Can I delete data?" a="Yes. Deletes are per-tenant and cannot affect other users." />

        <FAQ
          q="Why doesn’t my dashboard show data?"
          a="You may need at least one Sales or Expenses import. Also ensure the views and columns exist with exact names."
        />

        <FAQ q="What currency does it use?" a="USD. Values are stored as numeric(12,2)." />

        <FAQ
          q="Is my data private?"
          a="Yes. Every row is tenant-scoped through RLS (Row-Level Security). You cannot see others’ data and they cannot see yours."
        />

        <FAQ
          q="Is AI included?"
          a="Not yet. We’re focused on making the core numbers rock-solid first. AI-assisted insights are planned for a future update."
        />

        <FAQ
          q="How do I cancel or go back to the free plan?"
          a={
            <>
              You can cancel anytime from the <strong>Billing Portal</strong> (Profile → Billing Portal). After your subscription ends, your
              account stays active on the <strong>Starter (Free)</strong> plan. Your data remains in your tenant so you can upgrade again later.
            </>
          }
        />

        <FAQ
          q="Do you offer refunds?"
          a={
            <>
              During beta, refunds are handled case-by-case. If something didn’t work as expected, email{" "}
              <A href="mailto:support@kiorisolutions.com">support@kiorisolutions.com</A> and we’ll review it quickly.
            </>
          }
        />
      </section>

      <footer className="pt-4 text-xs text-neutral-500">
        Need help? Email <A href="mailto:support@kiorisolutions.com">support@kiorisolutions.com</A>.
      </footer>
    </main>
  );
}

function FAQ({ q, a }: { q: string; a: React.ReactNode }) {
  return (
    <div className="border border-neutral-800 rounded-lg p-4">
      <div className="font-medium">{q}</div>
      <div className="text-sm text-neutral-300 mt-1">{a}</div>
    </div>
  );
}
