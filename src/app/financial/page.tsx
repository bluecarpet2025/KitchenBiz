import "server-only";
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import ExportClient from "./ExportClient";

/* ----------------------------- utilities ----------------------------- */
const pad2 = (n: number) => String(n).padStart(2, "0");
const fmtDay = (d: Date) =>
  `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
const fmtMonth = (d: Date) =>
  `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
const fmtYear = (d: Date) => String(d.getUTCFullYear());
const usd = (n: number) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(Number(n) || 0);

function addMonths(d: Date, n: number) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
}

async function getTenantId(supabase: any): Promise<string | null> {
  const { data: u } = await supabase.auth.getUser();
  const uid = u?.user?.id;
  if (!uid) return null;
  const { data } = await supabase.from("profiles").select("tenant_id").eq("id", uid).maybeSingle();
  return (data?.tenant_id as string) ?? null;
}

async function getNum(
  supabase: any,
  view: string,
  periodCol: "day" | "week" | "month" | "year",
  key: string,
  col: "revenue" | "total" | "orders"
) {
  const { data } = await supabase.from(view).select(col).eq(periodCol, key).maybeSingle();
  return Number((data as any)?.[col] ?? 0);
}

async function listMonthsYTD(now: Date) {
  const arr: string[] = [];
  for (let m = 0; m <= now.getUTCMonth(); m++) {
    arr.push(fmtMonth(new Date(Date.UTC(now.getUTCFullYear(), m, 1))));
  }
  return arr;
}

async function expenseTotalsForMonth(supabase: any, tenantId: string, monthKey: string) {
  const start = new Date(Date.UTC(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)) - 1, 1));
  const end = addMonths(start, 1);
  const { data } = await supabase
    .from("expenses")
    .select("category, amount_usd")
    .eq("tenant_id", tenantId)
    .gte("occurred_at", `${fmtDay(start)}T00:00:00Z`)
    .lt("occurred_at", `${fmtDay(end)}T00:00:00Z`);
  const bucket = new Map<string, number>();
  (data ?? []).forEach((r: any) => {
    const k = (r.category?.trim() || "Misc") as string;
    bucket.set(k, (bucket.get(k) || 0) + Number(r.amount_usd || 0));
  });
  const total = [...bucket.values()].reduce((a, b) => a + b, 0);
  return { byCat: bucket, total };
}

async function expenseMixForRange(
  supabase: any,
  tenantId: string,
  startIso: string,
  endIso: string
): Promise<Array<{ name: string; value: number }>> {
  const { data } = await supabase
    .from("expenses")
    .select("category, amount_usd")
    .eq("tenant_id", tenantId)
    .gte("occurred_at", `${startIso}T00:00:00Z`)
    .lt("occurred_at", `${endIso}T00:00:00Z`);
  const bucket = new Map<string, number>();
  (data ?? []).forEach((r: any) => {
    const k = (r.category?.trim() || "Misc") as string;
    bucket.set(k, (bucket.get(k) || 0) + Number(r.amount_usd || 0));
  });
  return [...bucket.entries()].map(([name, value]) => ({ name, value }));
}

/* ----------------------------- page ----------------------------- */
export default async function FinancialPage() {
  const supabase = await createServerClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) {
    return (
      <main className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-semibold mb-4">Financials</h1>
        <p className="opacity-80">Sign in to view financials.</p>
      </main>
    );
  }

  const now = new Date();
  const thisMonth = fmtMonth(now);
  const thisYear = fmtYear(now);

  // HEADLINE KPIs (Month & YTD)
  const [monthSales, monthExp, monthOrders] = await Promise.all([
    getNum(supabase, "v_sales_month_totals", "month", thisMonth, "revenue"),
    getNum(supabase, "v_expense_month_totals", "month", thisMonth, "total"),
    getNum(supabase, "v_sales_month_totals", "month", thisMonth, "orders"),
  ]);
  const monthProfit = monthSales - monthExp;
  const monthAOV = monthOrders > 0 ? monthSales / monthOrders : 0;

  const [ytdSales, ytdExp, ytdOrders] = await Promise.all([
    getNum(supabase, "v_sales_year_totals", "year", thisYear, "revenue"),
    getNum(supabase, "v_expense_year_totals", "year", thisYear, "total"),
    getNum(supabase, "v_sales_year_totals", "year", thisYear, "orders"),
  ]);
  const ytdProfit = ytdSales - ytdExp;
  const ytdAOV = ytdOrders > 0 ? ytdSales / ytdOrders : 0;

  // TRAILING MONTHS series + income statement rows
  const monthsYTD = await listMonthsYTD(now);
  // extend backward to have 12 months visible
  while (monthsYTD.length < 12) {
    const first = monthsYTD[0];
    const d = new Date(Date.UTC(Number(first.slice(0, 4)), Number(first.slice(5, 7)) - 2, 1));
    monthsYTD.unshift(fmtMonth(d));
  }

  const byMonth = await Promise.all(
    monthsYTD.map(async (m) => {
      const [s, e] = await Promise.all([
        getNum(supabase, "v_sales_month_totals", "month", m, "revenue"),
        getNum(supabase, "v_expense_month_totals", "month", m, "total"),
      ]);
      const expCats = await expenseTotalsForMonth(supabase, tenantId, m);
      const food = expCats.byCat.get("Food") || 0;
      const labor = expCats.byCat.get("Labor") || 0;
      return {
        month: m,
        sales: s,
        expenses: e,
        profit: s - e,
        food,
        labor,
        rent: expCats.byCat.get("Rent") || 0,
        utilities: expCats.byCat.get("Utilities") || 0,
        marketing: expCats.byCat.get("Marketing") || 0,
        misc: expCats.byCat.get("Misc") || 0,
      };
    })
  );

  // EXPENSE MIX YTD
  const ytdStart = `${now.getUTCFullYear()}-01-01`;
  const nextYearStart = `${now.getUTCFullYear() + 1}-01-01`;
  const expenseMix = await expenseMixForRange(supabase, tenantId, ytdStart, nextYearStart);

  // Ratios
  const primePct = (() => {
    const food = expenseMix.find((x) => x.name?.toLowerCase() === "food")?.value || 0;
    const labor = expenseMix.find((x) => x.name?.toLowerCase() === "labor")?.value || 0;
    return Math.round(((food + labor) / Math.max(1, ytdSales)) * 100);
  })();
  const expensePct = Math.round((ytdExp / Math.max(1, ytdSales)) * 100);
  const marginPct = Math.round((ytdProfit / Math.max(1, ytdSales)) * 100);

  const defaultYear = now.getUTCFullYear();

  return (
    <main className="max-w-6xl mx-auto px-4 py-6">
      {/* Header + Export actions */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Financials</h1>
        <div className="flex gap-3 items-center">
          <ExportClient defaultYear={defaultYear} />
          <Link href="/sales" className="rounded border px-3 py-1 hover:bg-neutral-900 text-sm">Sales details</Link>
          <Link href="/expenses" className="rounded border px-3 py-1 hover:bg-neutral-900 text-sm">Expenses details</Link>
        </div>
      </div>

      {/* KPI Grid */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="border rounded-2xl p-4">
          <div className="text-xs opacity-70">THIS MONTH — SALES</div>
          <div className="text-2xl font-semibold mt-1">{usd(monthSales)}</div>
          <div className="text-xs opacity-70 mt-1">Orders: {monthOrders} • AOV: {usd(monthAOV)}</div>
        </div>
        <div className="border rounded-2xl p-4">
          <div className="text-xs opacity-70">THIS MONTH — EXPENSES</div>
          <div className="text-2xl font-semibold mt-1">{usd(monthExp)}</div>
        </div>
        <div className="border rounded-2xl p-4">
          <div className="text-xs opacity-70">THIS MONTH — PROFIT / LOSS</div>
          <div className={`text-2xl font-semibold mt-1 ${monthProfit < 0 ? "text-rose-400" : ""}`}>
            {usd(monthProfit)}
          </div>
        </div>

        <div className="border rounded-2xl p-4">
          <div className="text-xs opacity-70">YEAR TO DATE — SALES</div>
          <div className="text-2xl font-semibold mt-1">{usd(ytdSales)}</div>
          <div className="text-xs opacity-70 mt-1">Orders: {ytdOrders} • AOV: {usd(ytdAOV)}</div>
        </div>
        <div className="border rounded-2xl p-4">
          <div className="text-xs opacity-70">YEAR TO DATE — EXPENSES</div>
          <div className="text-2xl font-semibold mt-1">{usd(ytdExp)}</div>
          <div className="text-xs opacity-70 mt-1">Expense % of Sales: {expensePct}% • Prime %: {primePct}%</div>
        </div>
        <div className="border rounded-2xl p-4">
          <div className="text-xs opacity-70">YEAR TO DATE — PROFIT / LOSS</div>
          <div className={`text-2xl font-semibold mt-1 ${ytdProfit < 0 ? "text-rose-400" : ""}`}>{usd(ytdProfit)}</div>
          <div className="text-xs opacity-70 mt-1">Margin: {marginPct}%</div>
        </div>
      </section>

      {/* Charts */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
        <div className="border rounded-2xl p-4">
          <div className="text-xs opacity-70 mb-2">Trailing months — Sales vs Expenses</div>
          <div className="h-64 w-full">
            <MiniLines rows={byMonth} />
          </div>
        </div>
        <div className="border rounded-2xl p-4">
          <div className="text-xs opacity-70 mb-2">YTD expense mix</div>
          <div className="text-sm opacity-80">
            {expenseMix.length === 0 ? (
              <div className="opacity-60">No expenses recorded.</div>
            ) : (
              <ul className="grid grid-cols-2 gap-2">
                {expenseMix.map((r) => (
                  <li key={r.name} className="flex items-center justify-between border rounded px-2 py-1">
                    <span>{r.name}</span>
                    <span className="opacity-80">{usd(r.value)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* Income Statement by Month */}
      <section className="mt-6 border rounded-2xl">
        <div className="px-4 py-3 border-b text-xs opacity-70">Income Statement — by month</div>
        <div className="px-4 py-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="opacity-80">
              <tr>
                <th className="text-left font-normal px-2 py-1">Month</th>
                <th className="text-right font-normal px-2 py-1">Sales</th>
                <th className="text-right font-normal px-2 py-1">Food</th>
                <th className="text-right font-normal px-2 py-1">Labor</th>
                <th className="text-right font-normal px-2 py-1">Rent</th>
                <th className="text-right font-normal px-2 py-1">Utilities</th>
                <th className="text-right font-normal px-2 py-1">Marketing</th>
                <th className="text-right font-normal px-2 py-1">Misc</th>
                <th className="text-right font-normal px-2 py-1">Total Expenses</th>
                <th className="text-right font-normal px-2 py-1">Profit</th>
              </tr>
            </thead>
            <tbody>
              {byMonth.map((r) => (
                <tr key={r.month} className="border-t">
                  <td className="px-2 py-1">{r.month}</td>
                  <td className="px-2 py-1 text-right">{usd(r.sales)}</td>
                  <td className="px-2 py-1 text-right">{usd(r.food)}</td>
                  <td className="px-2 py-1 text-right">{usd(r.labor)}</td>
                  <td className="px-2 py-1 text-right">{usd(r.rent)}</td>
                  <td className="px-2 py-1 text-right">{usd(r.utilities)}</td>
                  <td className="px-2 py-1 text-right">{usd(r.marketing)}</td>
                  <td className="px-2 py-1 text-right">{usd(r.misc)}</td>
                  <td className="px-2 py-1 text-right">{usd(r.expenses)}</td>
                  <td className={`px-2 py-1 text-right ${r.profit < 0 ? "text-rose-400" : ""}`}>{usd(r.profit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

/* -------------------- tiny inline chart component (no deps) -------------------- */
function MiniLines({
  rows,
}: {
  rows: Array<{ month: string; sales: number; expenses: number }>;
}) {
  if (!rows.length) return <div className="opacity-60">No data.</div>;
  const w = 600,
    h = 220,
    p = 18;
  const xs = rows.map((_, i) => p + (i * (w - 2 * p)) / Math.max(1, rows.length - 1));
  const salesVals = rows.map((r) => r.sales);
  const expVals = rows.map((r) => r.expenses);
  const max = Math.max(1, ...salesVals, ...expVals);
  const y = (v: number) => h - p - (v / max) * (h - 2 * p);
  const toPoints = (vals: number[]) => vals.map((v, i) => `${xs[i]},${y(v)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-full">
      <rect
        x="0"
        y="0"
        width={w}
        height={h}
        fill="none"
        stroke="var(--neutral-800, #2a2a2a)"
      />
      {/* expenses */}
      <polyline
        points={toPoints(expVals)}
        fill="none"
        stroke="var(--chart-2, #4da3ff)"
        strokeWidth="2"
      />
      {/* sales */}
      <polyline
        points={toPoints(salesVals)}
        fill="none"
        stroke="var(--chart-1, #16a085)"
        strokeWidth="2"
      />
      {/* x labels */}
      {rows.map((r, i) => (
        <text
          key={i}
          x={xs[i]}
          y={h - 2}
          fontSize="10"
          textAnchor="middle"
          fill="var(--neutral-400, #aaa)"
        >
          {r.month.slice(5)}
        </text>
      ))}
    </svg>
  );
}
