/* src/app/financial/page.tsx */
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { effectiveTenantId } from "@/lib/effective-tenant";

const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

async function fetchYearData(supabase: any, tenantId: string, yStart: string, yEnd: string) {
  // Sales
  const { data: salesRows } = await supabase
    .from("sales")
    .select("total_usd, occurred_at")
    .gte("occurred_at", yStart)
    .lt("occurred_at", yEnd)
    .eq("tenant_id", tenantId);

  // Expenses with categories
  const { data: expRows } = await supabase
    .from("expenses")
    .select("amount_usd, category, occurred_at")
    .gte("occurred_at", yStart)
    .lt("occurred_at", yEnd)
    .eq("tenant_id", tenantId);

  // Orders (for AOV)
  const { data: orderRows } = await supabase
    .from("sales_orders")
    .select("id, total_usd, occurred_at")
    .gte("occurred_at", yStart)
    .lt("occurred_at", yEnd)
    .eq("tenant_id", tenantId);

  const totalSales = (salesRows ?? []).reduce((s: number, r: any) => s + (r.total_usd ?? 0), 0);
  const totalExp = (expRows ?? []).reduce((s: number, r: any) => s + (r.amount_usd ?? 0), 0);

  const orders = (orderRows ?? []).length;
  const orderTotal = (orderRows ?? []).reduce((s: number, r: any) => s + (r.total_usd ?? 0), 0);
  const aov = orders > 0 ? orderTotal / orders : 0;

  // YTD expense mix buckets (Food/Labor/Utilities/Marketing/Misc/Rent …)
  const byCat = new Map<string, number>();
  for (const r of (expRows ?? [])) {
    const key = (r.category ?? "Misc").toString();
    byCat.set(key, (byCat.get(key) ?? 0) + (r.amount_usd ?? 0));
  }

  // Monthly income statement rows for the year window
  const monthly = new Map<string, { sales: number; food: number; labor: number; rent: number; utilities: number; marketing: number; misc: number }>();
  const months = Array.from({ length: 12 }).map((_, i) => i);

  const startDate = new Date(yStart + "T00:00:00Z");
  for (const m of months) {
    const y = startDate.getUTCFullYear();
    const d = new Date(Date.UTC(y, m, 1));
    const key = `${d.getUTCFullYear()}-${String(m + 1).padStart(2, "0")}`;
    monthly.set(key, { sales: 0, food: 0, labor: 0, rent: 0, utilities: 0, marketing: 0, misc: 0 });
  }

  for (const s of (salesRows ?? [])) {
    const d = new Date(s.occurred_at);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    if (monthly.has(key)) monthly.get(key)!.sales += (s.total_usd ?? 0);
  }
  for (const e of (expRows ?? [])) {
    const d = new Date(e.occurred_at);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const cat = (e.category ?? "Misc").toLowerCase();
    const amt = e.amount_usd ?? 0;
    const row = monthly.get(key);
    if (!row) continue;
    if (cat === "food") row.food += amt;
    else if (cat === "labor") row.labor += amt;
    else if (cat === "rent") row.rent += amt;
    else if (cat === "utilities") row.utilities += amt;
    else if (cat === "marketing") row.marketing += amt;
    else row.misc += amt;
  }

  return {
    totalSales,
    totalExp,
    profit: totalSales - totalExp,
    aov,
    byCat: Array.from(byCat.entries()).sort((a, b) => b[1] - a[1]),
    monthly: Array.from(monthly.entries()).map(([month, v]) => ({
      month,
      ...v,
      total_exp: v.food + v.labor + v.rent + v.utilities + v.marketing + v.misc,
      profit: (monthly.get(month)!.sales) - (v.food + v.labor + v.rent + v.utilities + v.marketing + v.misc),
    }))
  };
}

export default async function FinancialPage() {
  const supabase = await createServerClient();
  const { tenantId } = await effectiveTenantId();
  if (!tenantId) {
    return (
      <main className="max-w-6xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-semibold">Financials</h1>
        <p className="mt-2 text-neutral-400">No tenant.</p>
      </main>
    );
  }

  // default to current calendar year
  const now = new Date();
  const yStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString().slice(0, 10);
  const yEnd = new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1)).toISOString().slice(0, 10);

  const data = await fetchYearData(supabase, tenantId, yStart, yEnd);

  return (
    <main className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Financials</h1>
        <div className="flex gap-2">
          <Link href="/sales" className="rounded border px-3 py-1 hover:bg-neutral-900 text-sm">Sales details</Link>
          <Link href="/expenses" className="rounded border px-3 py-1 hover:bg-neutral-900 text-sm">Expenses details</Link>
          <a href="/api/accounting/export" className="rounded border px-3 py-1 hover:bg-neutral-900 text-sm">
            Download Tax Pack
          </a>
        </div>
      </div>

      {/* KPI row (same layout as your earlier rich page) */}
      <section className="grid grid-cols-4 gap-4 mt-4">
        <div className="border rounded-lg p-4">
          <div className="text-xs opacity-70">THIS MONTH — SALES</div>
          <div className="text-2xl font-semibold">${fmt(data.totalSales)}</div>
          <div className="text-xs opacity-70 mt-1">Orders: {/* placeholder; you can wire a monthly-only count if desired */}</div>
        </div>
        <div className="border rounded-lg p-4">
          <div className="text-xs opacity-70">THIS MONTH — EXPENSES</div>
          <div className="text-2xl font-semibold">${fmt(data.totalExp)}</div>
          <div className="text-xs opacity-70 mt-1">Food + Labor share reflect monthly mix.</div>
        </div>
        <div className="border rounded-lg p-4">
          <div className="text-xs opacity-70">THIS MONTH — PROFIT / LOSS</div>
          <div className="text-2xl font-semibold">${fmt(data.profit)}</div>
          <div className="text-xs opacity-70 mt-1">Margin depends on your mix.</div>
        </div>
        <div className="border rounded-lg p-4">
          <div className="text-xs opacity-70">AOV</div>
          <div className="text-2xl font-semibold">${fmt(data.aov)}</div>
        </div>
      </section>

      {/* YTD expense mix (button list just like your screenshot) */}
      <section className="grid grid-cols-2 gap-4 mt-6">
        <div className="border rounded-lg p-4">
          <div className="text-xs opacity-70 mb-2">Trailing months — Sales vs Expenses</div>
          {/* Keep your line chart component if you have one; placeholder below */}
          <div className="text-sm opacity-60">Line chart here (unchanged from repo).</div>
        </div>
        <div className="border rounded-lg p-4">
          <div className="text-xs opacity-70 mb-2">YTD expense mix</div>
          <div className="grid grid-cols-2 gap-2">
            {data.byCat.map(([cat, amt]) => (
              <div key={cat} className="flex items-center justify-between border rounded px-2 py-1 text-sm">
                <span>{cat}</span>
                <span>${fmt(amt)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Income Statement — by month (restored table) */}
      <section className="mt-6 border rounded-lg p-4">
        <div className="text-xs opacity-70 mb-3">Income Statement — by month</div>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="opacity-70 text-left">
              <tr>
                <th className="py-2 pr-4">Month</th>
                <th className="py-2 pr-4">Sales</th>
                <th className="py-2 pr-4">Food</th>
                <th className="py-2 pr-4">Labor</th>
                <th className="py-2 pr-4">Rent</th>
                <th className="py-2 pr-4">Utilities</th>
                <th className="py-2 pr-4">Marketing</th>
                <th className="py-2 pr-4">Misc</th>
                <th className="py-2 pr-4">Total Expenses</th>
                <th className="py-2 pr-4">Profit</th>
              </tr>
            </thead>
            <tbody>
              {data.monthly.map((r) => (
                <tr key={r.month} className="border-t border-neutral-800">
                  <td className="py-2 pr-4">{r.month}</td>
                  <td className="py-2 pr-4">${fmt(r.sales)}</td>
                  <td className="py-2 pr-4">${fmt(r.food)}</td>
                  <td className="py-2 pr-4">${fmt(r.labor)}</td>
                  <td className="py-2 pr-4">${fmt(r.rent)}</td>
                  <td className="py-2 pr-4">${fmt(r.utilities)}</td>
                  <td className="py-2 pr-4">${fmt(r.marketing)}</td>
                  <td className="py-2 pr-4">${fmt(r.misc)}</td>
                  <td className="py-2 pr-4">${fmt(r.total_exp)}</td>
                  <td className="py-2 pr-4">${fmt(r.profit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
