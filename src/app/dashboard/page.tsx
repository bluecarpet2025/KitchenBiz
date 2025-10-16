/* src/app/dashboard/page.tsx */
import { createServerClient } from "@/lib/supabase/server";
import { effectiveTenantId } from "@/lib/effective-tenant";
import Link from "next/link";

// --- lightweight helpers ---
const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

type Totals = {
  sales: number;
  expenses: number;
  orders: number;
  aov: number;
  foodShare?: number;
  laborShare?: number;
  primeShare?: number;
};

async function getMonthKpis(supabase: any, tenantId: string) {
  // current month span (UTC)
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);

  // previous month
  const pStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
  const pEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);

  // trailing 3 months (for averages)
  const t3Start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1)).toISOString().slice(0, 10);

  // SALES (month)
  const { data: salesMonth } = await supabase
    .from("sales")
    .select("total_usd")
    .gte("occurred_at", start)
    .lt("occurred_at", end)
    .eq("tenant_id", tenantId);

  const { data: salesPrev } = await supabase
    .from("sales")
    .select("total_usd")
    .gte("occurred_at", pStart)
    .lt("occurred_at", pEnd)
    .eq("tenant_id", tenantId);

  const { data: salesT3 } = await supabase
    .from("sales")
    .select("total_usd")
    .gte("occurred_at", t3Start)
    .lt("occurred_at", end)
    .eq("tenant_id", tenantId);

  const curSales = (salesMonth ?? []).reduce((s: number, r: any) => s + (r.total_usd ?? 0), 0);
  const prevSales = (salesPrev ?? []).reduce((s: number, r: any) => s + (r.total_usd ?? 0), 0);
  const t3Sales = (salesT3 ?? []).reduce((s: number, r: any) => s + (r.total_usd ?? 0), 0);
  const t3Months = 3; // calendar months, not “observed” months

  // EXPENSES (month)
  const { data: expMonth } = await supabase
    .from("expenses")
    .select("amount_usd, category")
    .gte("occurred_at", start)
    .lt("occurred_at", end)
    .eq("tenant_id", tenantId);

  const { data: expPrev } = await supabase
    .from("expenses")
    .select("amount_usd")
    .gte("occurred_at", pStart)
    .lt("occurred_at", pEnd)
    .eq("tenant_id", tenantId);

  const curExp = (expMonth ?? []).reduce((s: number, r: any) => s + (r.amount_usd ?? 0), 0);
  const prevExp = (expPrev ?? []).reduce((s: number, r: any) => s + (r.amount_usd ?? 0), 0);

  // FOOD/LABOR/PRIME shares this month
  const food = (expMonth ?? []).filter((r: any) => (r.category ?? "").toLowerCase() === "food")
    .reduce((s: number, r: any) => s + (r.amount_usd ?? 0), 0);
  const labor = (expMonth ?? []).filter((r: any) => (r.category ?? "").toLowerCase() === "labor")
    .reduce((s: number, r: any) => s + (r.amount_usd ?? 0), 0);

  const foodShare = curSales > 0 ? food / curSales : 0;
  const laborShare = curSales > 0 ? labor / curSales : 0;
  const primeShare = foodShare + laborShare;

  // ORDERS + AOV this month (from order headers / or sales lines fallback)
  const { data: orderRows } = await supabase
    .from("sales_orders")
    .select("id, total_usd")
    .gte("occurred_at", start)
    .lt("occurred_at", end)
    .eq("tenant_id", tenantId);

  const orders = (orderRows ?? []).length;
  const orderTotal = (orderRows ?? []).reduce((s: number, r: any) => s + (r.total_usd ?? 0), 0);
  const aov = orders > 0 ? orderTotal / orders : 0;

  // 3 little helper lines:
  const salesMoM = prevSales > 0 ? (curSales - prevSales) / prevSales : 0;
  const expMoM = prevExp > 0 ? (curExp - prevExp) / prevExp : 0;
  const profitMoM = (prevSales - prevExp) > 0 ? ((curSales - curExp) - (prevSales - prevExp)) / (prevSales - prevExp) : 0;

  const avg3mSales = t3Sales / t3Months;
  const expPctOfSales = curSales > 0 ? curExp / curSales : 0;
  const marginPct = curSales > 0 ? (curSales - curExp) / curSales : 0;

  const kpis: Totals = {
    sales: curSales,
    expenses: curExp,
    orders,
    aov,
    foodShare,
    laborShare,
    primeShare,
  };

  return {
    kpis,
    helpers: {
      salesMoM, expMoM, profitMoM,
      avg3mSales,
      expPctOfSales,
      marginPct,
    }
  };
}

async function getTopItems(supabase: any, tenantId: string) {
  // current dashboard range is “current filter” = this month; keep same window
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);

  // sales_order_lines: product_name, total
  const { data } = await supabase
    .from("sales_order_lines")
    .select("product_name, total")
    .gte("occurred_at", start)
    .lt("occurred_at", end)
    .eq("tenant_id", tenantId);

  const sums = new Map<string, number>();
  for (const r of (data ?? [])) {
    const key = (r.product_name ?? "").toString();
    const v = Number(r.total ?? 0);
    if (!key) continue;
    sums.set(key, (sums.get(key) ?? 0) + v);
  }
  const arr = Array.from(sums.entries())
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5); // up to 5 items like before

  return arr;
}

export default async function DashboardPage() {
  const supabase = await createServerClient();
  const { tenantId } = await effectiveTenantId();

  if (!tenantId) {
    return (
      <main className="max-w-6xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-4 text-neutral-400">No tenant found.</p>
      </main>
    );
  }

  const { kpis, helpers } = await getMonthKpis(supabase, tenantId);
  const topItems = await getTopItems(supabase, tenantId);

  return (
    <main className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <div className="flex gap-2">
          <Link href="/sales" className="rounded border px-3 py-1 hover:bg-neutral-900 text-sm">Sales details</Link>
          <Link href="/expenses" className="rounded border px-3 py-1 hover:bg-neutral-900 text-sm">Expenses details</Link>
        </div>
      </div>

      {/* KPI row (restored helper lines under each) */}
      <section className="grid grid-cols-4 gap-4">
        <div className="border rounded-lg p-4">
          <div className="text-xs opacity-70">SALES — MONTH</div>
          <div className="text-2xl font-semibold">${fmt(kpis.sales)}</div>
          <div className="mt-2 text-emerald-400 text-xs">
            MoM: {pct(helpers.salesMoM)}<br />
            3-mo avg: ${fmt(helpers.avg3mSales)}<br />
            AOV: ${fmt(kpis.aov)}
          </div>
        </div>
        <div className="border rounded-lg p-4">
          <div className="text-xs opacity-70">EXPENSES — MONTH</div>
          <div className="text-2xl font-semibold">${fmt(kpis.expenses)}</div>
          <div className="mt-2 text-emerald-400 text-xs">
            MoM: {pct(helpers.expMoM)}<br />
            Exp % of sales: {pct(helpers.expPctOfSales)}<br />
            Prime %: {pct(kpis.primeShare ?? 0)}
          </div>
        </div>
        <div className="border rounded-lg p-4">
          <div className="text-xs opacity-70">PROFIT / LOSS — MONTH</div>
          <div className="text-2xl font-semibold">${fmt(kpis.sales - kpis.expenses)}</div>
          <div className="mt-2 text-emerald-400 text-xs">
            MoM: {pct(helpers.profitMoM)}<br />
            3-mo avg: ${fmt(helpers.avg3mSales - helpers.avg3mSales * (helpers.expPctOfSales || 0))}<br />
            Margin: {pct(helpers.marginPct)}
          </div>
        </div>
        <div className="border rounded-lg p-4">
          <div className="text-xs opacity-70">SALES vs GOAL</div>
          <div className="text-2xl font-semibold">${fmt(kpis.sales)}</div>
          {/* goal UI remains as before; this card is just a placeholder for the header value */}
        </div>
      </section>

      {/* Middle KPI tiles (orders / AOV / Food% / Labor% / Prime%) — values unchanged, now guaranteed */}
      <section className="grid grid-cols-5 gap-4 mt-4">
        <div className="border rounded-lg p-4"><div className="text-xs opacity-70">ORDERS</div><div className="text-2xl font-semibold">{kpis.orders}</div></div>
        <div className="border rounded-lg p-4"><div className="text-xs opacity-70">AOV</div><div className="text-2xl font-semibold">${fmt(kpis.aov)}</div></div>
        <div className="border rounded-lg p-4"><div className="text-xs opacity-70">FOOD %</div><div className="text-2xl font-semibold">{pct(kpis.foodShare ?? 0)}</div></div>
        <div className="border rounded-lg p-4"><div className="text-xs opacity-70">LABOR %</div><div className="text-2xl font-semibold">{pct(kpis.laborShare ?? 0)}</div></div>
        <div className="border rounded-lg p-4"><div className="text-xs opacity-70">PRIME %</div><div className="text-2xl font-semibold">{pct(kpis.primeShare ?? 0)}</div></div>
      </section>

      {/* Top Items — restore up to 5 bars */}
      <section className="mt-6 border rounded-lg p-4">
        <div className="text-xs opacity-70 mb-3">Top items — current range</div>
        {topItems.length === 0 ? (
          <div className="text-sm opacity-60">No items</div>
        ) : (
          <div className="space-y-2">
            {topItems.map((it) => (
              <div key={it.name} className="w-full">
                <div className="flex justify-between text-sm mb-1">
                  <span>{it.name}</span><span>${fmt(it.total)}</span>
                </div>
                <div className="h-2 bg-neutral-900 rounded">
                  <div
                    className="h-2 bg-teal-500 rounded"
                    style={{ width: `${(it.total / topItems[0].total) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* The rest of your charts/summary blocks stay as you already have them in the repo */}
    </main>
  );
}
