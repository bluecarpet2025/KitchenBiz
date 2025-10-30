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
          Kiori Solutions is built for small food businesses. Every data-entry page supports create, edit, delete,
          CSV upload, and a downloadable template. This guide explains each page and common workflows.
        </p>
      </header>

      {/* Inventory */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Inventory</h2>
        <p className="text-sm text-neutral-300">
          Track what you stock, purchases, and daily counts. Prices auto-calc to a base unit for consistent costing.
        </p>
        <ul className="list-disc ml-6 text-sm text-neutral-300 space-y-1">
          <li>
            Items: view/manage at <A href="/inventory">/inventory</A>. Create new:{" "}
            <A href="/inventory/items/new">/inventory/items/new</A>. Edit/delete inside item detail.
          </li>
          <li>
            Purchases: record vendor purchases at{" "}
            <A href="/inventory/purchase">/inventory/purchase</A>. Adds stock-on-hand and updates price history.
          </li>
          <li>
            Daily counts: start a count at{" "}
            <A href="/inventory/counts/new">/inventory/counts/new</A>. After entering quantities, press{" "}
            <em>Commit</em> to create adjustments so on-hand matches reality.
          </li>
          <li>
            Import items CSV: <A href="/inventory/import">/inventory/import</A>. Download template from that page.
          </li>
          <li>
            Export or print: available from the Inventory toolbar where shown.
          </li>
        </ul>
        <FAQ
          q="Makeable shows 0 — how do I fix it?"
          a={
            <>
              Record a <A href="/inventory/purchase">Purchase</A> or commit a{" "}
              <A href="/inventory/counts/new">Count</A>. Makeable uses the stock-on-hand ledger from those
              transactions.
            </>
          }
        />
      </section>

      {/* Recipes */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Recipes</h2>
        <ul className="list-disc ml-6 text-sm text-neutral-300 space-y-1">
          <li>
            Manage recipes at <A href="/recipes">/recipes</A>. Create: <A href="/recipes/new">/recipes/new</A>.
          </li>
          <li>
            Add ingredients and their quantities. Per-serving cost is calculated from your current base-unit costs.
          </li>
          <li>
            “Makeable” reflects whether enough stock exists to make this recipe now (based on Inventory).
          </li>
        </ul>
      </section>

      {/* Menu */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Menu</h2>
        <ul className="list-disc ml-6 text-sm text-neutral-300 space-y-1">
          <li>
            Build menus at <A href="/menu">/menu</A>. You can save, load, print, and share read-only links.
          </li>
          <li>
            Suggested price is derived from your target margin and recipe costs.
          </li>
        </ul>
      </section>

      {/* Sales */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Sales</h2>
        <ul className="list-disc ml-6 text-sm text-neutral-300 space-y-1">
          <li>
            Overview and list at <A href="/sales">/sales</A>. Import CSV at{" "}
            <A href="/sales/import">/sales/import</A>. Download the template on the import page.
          </li>
          <li>
            Imported rows create <code>sales_orders</code> and <code>sales_order_lines</code>. Dashboard totals pull
            from the <code>v_sales_*_totals</code> views.
          </li>
        </ul>
      </section>

      {/* Expenses */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Expenses</h2>
        <ul className="list-disc ml-6 text-sm text-neutral-300 space-y-1">
          <li>
            Overview and list at <A href="/expenses">/expenses</A>. Import CSV at{" "}
            <A href="/expenses/import">/expenses/import</A>. Download the template on the import page.
          </li>
          <li>
            Required CSV headers: <code>date, category, description, amount</code>. Amounts are USD.
          </li>
        </ul>
      </section>

      {/* Staff */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Staff</h2>
        <ul className="list-disc ml-6 text-sm text-neutral-300 space-y-1">
          <li>
            Manage your roster at <A href="/staff/manage">/staff/manage</A>. Keep names, roles, and contact basics for
            export and admin.
          </li>
        </ul>
      </section>

      {/* Dashboard */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Dashboard</h2>
        <p className="text-sm text-neutral-300">
          Shows Sales &amp; Expenses in daily, weekly, monthly, and YTD cards plus 7-day mini tables.
        </p>
        <ul className="list-disc ml-6 text-sm text-neutral-300 space-y-1">
          <li>
            The dashboard expects specific view names/columns: <code>v_sales_*_totals</code> with{" "}
            <code>revenue</code>; <code>v_expense_*_totals</code> with <code>total</code>; time labels:{" "}
            <code>day</code>, <code>week</code> (IYYY-WIW), <code>month</code> (YYYY-MM), <code>year</code> (YYYY).
          </li>
          <li>
            If a card is blank, verify the view exists and column names match exactly.
          </li>
        </ul>
      </section>

      {/* CSV & Troubleshooting */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">CSV templates & troubleshooting</h2>
        <ul className="list-disc ml-6 text-sm text-neutral-300 space-y-1">
          <li>
            Use the template from each Import page. Importers ignore extra columns and validate required headers.
          </li>
          <li>
            Dates should be ISO (<code>YYYY-MM-DD</code>). Money is numbers only (no $ symbol).
          </li>
          <li>
            If an import fails, check the toast message and download the error report (when provided).
          </li>
        </ul>
      </section>

      {/* FAQ quickies */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">FAQ</h2>
        <FAQ
          q="Can I delete data?"
          a="Yes—each list or detail screen has delete actions. Deletes are tenant-scoped."
        />
        <FAQ
          q="Why don’t I see any sales/expenses on the dashboard?"
          a="Ensure you’ve imported sales/expenses and that the view names and columns match what the dashboard expects."
        />
        <FAQ
          q="What currency does it use?"
          a="USD. Amounts are stored as numeric(12,2)."
        />
      </section>

      <footer className="pt-4 text-xs text-neutral-500">
        Need help? Email <A href="mailto:bluecarpetllc@gmail.com">bluecarpetllc@gmail.com</A>.
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
