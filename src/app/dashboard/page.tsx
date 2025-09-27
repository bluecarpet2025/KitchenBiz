import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { SalesVsExpensesChart, ExpenseDonut, TopItemsChart } from "./charts";

/* ----------------------------- tiny helpers ----------------------------- */
const fmtUSD = (n: number) =>
  (n || 0).toLocaleString(undefined, { style: "currency", currency: "USD" });
const pad = (n: number) => n.toString().padStart(2, "0");

const today = new Date();
const monthStr = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
const yearStr = (d: Date) => `${d.getUTCFullYear()}`;
const firstDayOfMonth = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
const lastDayOfMonth = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
const toISODate = (d: Date) => d.toISOString().slice(0, 10);

/* ----------------------------- DB helpers ------------------------------ */
/** Select a single aggregate from a view; rely on RLS for tenant scoping. */
async function sumOne(
  supabase: any,
  view: string,
  periodCol: "day" | "week" | "month" | "year",
  key: string,
  col: "revenue" | "total" | "orders",
): Promise<number> {
  const { data } = await supabase
    .from(view)
    .select(col)
    .eq(periodCol, key)
    .maybeSingle();
  const raw = (data as any)?.[col];
  return typeof raw === "number" ? raw : Number(raw ?? 0);
}

/** Expenses by category for the date window (RLS enforces tenant). */
async function rangeExpensesByCategory(
  supabase: any,
  startISO: string,
  endISO: string
): Promise<Array<{ name: string; value: number }>> {
  const { data } = await supabase
    .from("expenses")
    .select("category, amount_usd, occurred_at, created_at")
    .or(`and(occurred_at.gte.${startISO},occurred_at.lte.${endISO}),and(occurred_at.is.null,created_at.gte.${startISO},created_at.lte.${endISO})`);
  if (!data) return [];
  const m = new Map<string, number>();
  for (const r of data) m.set(r.category || "Other", (m.get(r.category || "Other") || 0) + Number(r.amount_usd || 0));
  return Array.from(m.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

/** Robust Top Items: 2-step fetch (orders in window → lines for those orders). */
async function topItemsForRange(
  supabase: any,
  startISO: string,
  endISO: string
): Promise<Array<{ name: string; revenue: number }>> {
  const { data: orders } = await supabase
    .from("sales_orders")
    .select("id, occurred_at, created_at")
    .or(
      `and(occurred_at.gte.${startISO},occurred_at.lte.${endISO}),` +
      `and(occurred_at.is.null,created_at.gte.${startISO},created_at.lte.${endISO})`
    )
    .limit(10000);

  const ids = (orders ?? []).map((o: any) => o.id);
  if (ids.length === 0) return [];

  const { data: lines } = await supabase
    .from("sales_order_lines")
    .select("order_id, product, qty, unit_price")
    .in("order_id", ids.slice(0, 10000));

  if (!lines) return [];
  const m = new Map<string, number>();
  for (const r of lines as any[]) {
    const name = r.product || "Unknown";
    const rev = Number(r.qty || 0) * Number(r.unit_price || 0);
    m.set(name, (m.get(name) || 0) + rev);
  }
  return [...m.entries()]
    .map(([name, revenue]) => ({ name, revenue }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);
}

/** Weekday revenue for current month (Sun..Sat). */
async function weekdayRevenueThisMonth(supabase: any) {
  const start = toISODate(firstDayOfMonth(today));
  const end   = toISODate(lastDayOfMonth(today));
  const { data } = await supabase
    .from("v_sales_day_totals")
    .select("day, revenue")
    .gte("day", start)
    .lte("day", end)
    .order("day", { ascending: true });
  if (!data) return [];
  const totals = [0, 0, 0, 0, 0, 0, 0]; // Sun..Sat
  for (const r of data as any[]) {
    const d = new Date(r.day + "T00:00:00Z");
    totals[d.getUTCDay()] += Number(r.revenue || 0);
  }
  const label = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return label.map((l, i) => ({ label: l, amount: totals[i] }));
}

/* ------------------------------ UI bits ------------------------------ */
function Delta({ value }: { value: number }) {
  const color = value > 0 ? "text-emerald-400" : value < 0 ? "text-rose-400" : "text-neutral-400";
  const sign = value > 0 ? "+" : "";
  return <div className={`text-xs mt-1 ${color}`}>{sign}{value.toFixed(1)}% MoM</div>;
}

function Tile({
  title,
  value,
  tooltip,
  children,
}: {
  title: string;
  value: string;
  tooltip?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="border rounded p-4">
      <div className="text-xs opacity-80" title={tooltip}>{title}</div>
      <div className="text-2xl font-semibold">{value}</div>
      {children}
    </div>
  );
}

/* -------------------------------- Page -------------------------------- */
// keep type loose to avoid Next.js Page typing trap
export default async function DashboardPage(props: { searchParams?: any }) {
  const sp = (props?.searchParams ? await props.searchParams : {}) as Record<string, string>;
  const range = (typeof sp.range === "string" ? sp.range : "month") as "today" | "week" | "month" | "ytd";

  const supabase = await createServerClient();

  /* -------- determine period keys & date window based on range -------- */
  const now = new Date();
  let keyMonth = monthStr(now);
  let startISO: string;
  let endISO: string;

  if (range === "today") {
    startISO = endISO = toISODate(now);
  } else if (range === "week") {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const diff = d.getUTCDay(); // 0..6
    const sun = new Date(d); sun.setUTCDate(d.getUTCDate() - diff);
    const sat = new Date(sun); sat.setUTCDate(sun.getUTCDate() + 6);
    startISO = toISODate(sun);
    endISO   = toISODate(sat);
  } else if (range === "ytd") {
    startISO = `${now.getUTCFullYear()}-01-01`;
    endISO   = toISODate(now);
  } else {
    // month (default)
    startISO = toISODate(firstDayOfMonth(now));
    endISO   = toISODate(lastDayOfMonth(now));
  }

  /* ------------------------ top summary aggregates ----------------------- */
  // Rely on RLS; do not filter by tenant_id explicitly.
  const [salesMonth, ordersMonth, expMonth] = await Promise.all([
    sumOne(supabase, "v_sales_month_totals", "month", keyMonth, "revenue"),
    sumOne(supabase, "v_sales_month_totals", "month", keyMonth, "orders"),
    sumOne(supabase, "v_expense_month_totals", "month", keyMonth, "total"),
  ]);
  const profitMonth = salesMonth - expMonth;

  // deltas vs previous month
  const prevMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const prevMonthKey  = monthStr(prevMonthDate);
  const [salesPrev, expPrev] = await Promise.all([
    sumOne(supabase, "v_sales_month_totals", "month", prevMonthKey, "revenue"),
    sumOne(supabase, "v_expense_month_totals", "month", prevMonthKey, "total"),
  ]);
  const profitPrev = salesPrev - expPrev;
  const pct = (a: number, b: number) => (b === 0 ? 0 : ((a - b) / Math.max(1, b)) * 100);
  const salesMoM  = pct(salesMonth,  salesPrev);
  const expMoM    = pct(expMonth,    expPrev);
  const profMoM   = pct(profitMonth, profitPrev);

  /* ------------------------ KPI (current range) ------------------------- */
  const cats = await rangeExpensesByCategory(supabase, startISO, endISO);
  const getCat = (name: string) => cats.find(c => c.name.toLowerCase() === name.toLowerCase())?.value ?? 0;
  const foodTotal  = getCat("Food");
  const laborTotal = getCat("Labor");

  const aov      = ordersMonth > 0 ? salesMonth / ordersMonth : 0;
  const foodPct  = salesMonth > 0 ? (foodTotal  / salesMonth) * 100 : 0;
  const laborPct = salesMonth > 0 ? (laborTotal / salesMonth) * 100 : 0;
  const primePct = Math.min(100, foodPct + laborPct);

  /* ------------------------ charts & tables data ------------------------ */
  const topItems = await topItemsForRange(supabase, startISO, endISO);
  const weekday  = await weekdayRevenueThisMonth(supabase);

  // 12mo Sales vs Expenses line
  const months: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push(monthStr(d));
  }
  const salesSeries = await Promise.all(months.map((k) => sumOne(supabase, "v_sales_month_totals", "month", k, "revenue")));
  const expSeries   = await Promise.all(months.map((k) => sumOne(supabase, "v_expense_month_totals", "month", k, "total")));
  const lineData    = months.map((m, i) => ({ month: m, sales: salesSeries[i], expenses: expSeries[i] }));

  // Last 4 months quick table
  const last4 = months.slice(-4);
  const last4Sales  = await Promise.all(last4.map((k) => sumOne(supabase, "v_sales_month_totals", "month", k, "revenue")));
  const last4Orders = await Promise.all(last4.map((k) => sumOne(supabase, "v_sales_month_totals", "month", k, "orders")));
  const last4Exp    = await Promise.all(last4.map((k) => sumOne(supabase, "v_expense_month_totals", "month", k, "total")));
  const last4Rows   = last4.map((m, i) => {
    const sales    = last4Sales[i];
    const orders   = Math.max(0, Math.floor(last4Orders[i]));
    const aovM     = orders > 0 ? sales / orders : 0;
    const expenses = last4Exp[i];
    const profit   = sales - expenses;
    return { month: m, sales, orders, aov: aovM, expenses, profit };
  });

  /* -------------------------------- UI --------------------------------- */
  const active = (r: string) =>
    `px-3 py-1 rounded border ${r === range ? "" : "opacity-60 hover:bg-neutral-900"}`;

  return (
    <main className="max-w-7xl mx-auto px-4 py-6 space-y-4">
      {/* Range toggles */}
      <div className="flex gap-2 mb-2">
        <Link className={active("today")} href="/dashboard?range=today">Today</Link>
        <Link className={active("week")}  href="/dashboard?range=week">Week</Link>
        <Link className={active("month")} href="/dashboard?range=month">Month</Link>
        <Link className={active("ytd")}   href="/dashboard?range=ytd">YTD</Link>
      </div>

      {/* Top tiles */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Tile title="MONTH — SALES" value={fmtUSD(salesMonth)}>
          <Delta value={salesMoM} />
        </Tile>
        <Tile title="MONTH — EXPENSES" value={fmtUSD(expMonth)}>
          <Delta value={expMoM} />
        </Tile>
        <Tile title="MONTH — PROFIT / LOSS" value={fmtUSD(profitMonth)}>
          <Delta value={profMoM} />
        </Tile>
        <div className="border rounded p-4">
          <div className="text-xs opacity-80">SALES vs GOAL</div>
          <div className="text-2xl font-semibold">{fmtUSD(salesMonth)}</div>
          <div className="mt-2 text-xs opacity-80">Goal $10,000.00</div>
          <div className="h-2 bg-neutral-800 rounded mt-1 overflow-hidden">
            <div className="h-2 bg-pink-500" style={{ width: `${Math.min(100, (salesMonth / 10000) * 100)}%` }} />
          </div>
        </div>
      </section>

      {/* KPI tiles with tooltips */}
      <section className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Tile title="ORDERS (M)" value={String(ordersMonth)} tooltip="Total orders recorded this month (distinct sales orders)." />
        <Tile title="AOV (M)" value={fmtUSD(aov)} tooltip="Average Order Value = Sales / Orders for this month." />
        <Tile title="FOOD %" value={`${Math.round(foodPct)}%`} tooltip="Food Cost % = Food expenses / Sales for this month." />
        <Tile title="LABOR %" value={`${Math.round(laborPct)}%`} tooltip="Labor Cost % = Labor expenses / Sales for this month." />
        <Tile title="PRIME %" value={`${Math.round(primePct)}%`} tooltip="Prime Cost % = Food % + Labor % (target ≤ 60%)." />
      </section>

      {/* Charts row */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SalesVsExpensesChart data={lineData} />
        <ExpenseDonut
          data={[
            { name: "Food", value: foodTotal },
            { name: "Labor", value: laborTotal },
            ...cats.filter(c => !["Food", "Labor"].includes(c.name)).slice(0, 5),
          ]}
        />
      </section>

      {/* Weekday + Top items */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="border rounded p-4">
          <div className="text-sm opacity-80 mb-2">Weekday revenue (this month)</div>
          <div className="space-y-2">
            {weekday.map((w: any) => (
              <div key={w.label} className="flex items-center gap-3">
                <div className="w-8 opacity-70 text-sm">{w.label}</div>
                <div className="flex-1 h-2 bg-neutral-800 rounded overflow-hidden">
                  <div
                    className="h-2 bg-neutral-300"
                    style={{
                      width: `${Math.min(100, (w.amount / Math.max(1, Math.max(...weekday.map((x: any) => x.amount)))) * 100)}%`,
                    }}
                  />
                </div>
                <div className="w-24 text-right text-sm">{fmtUSD(w.amount)}</div>
              </div>
            ))}
          </div>
        </div>
        <TopItemsChart data={topItems} />
      </section>

      {/* Last 4 months quick table */}
      <section className="border rounded">
        <div className="px-4 py-3 border-b text-sm opacity-80">Last 4 months (quick look)</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="opacity-80">
              <tr className="border-b">
                <th className="text-left p-2">Period</th>
                <th className="text-right p-2">Sales</th>
                <th className="text-right p-2">Orders</th>
                <th className="text-right p-2">AOV</th>
                <th className="text-right p-2">Expenses</th>
                <th className="text-right p-2">Profit</th>
              </tr>
            </thead>
            <tbody>
              {last4Rows.map((r) => (
                <tr key={r.month} className="border-b">
                  <td className="p-2"><span className="underline">{r.month}</span></td>
                  <td className="p-2 text-right">{fmtUSD(r.sales)}</td>
                  <td className="p-2 text-right">{r.orders.toLocaleString()}</td>
                  <td className="p-2 text-right">{fmtUSD(r.aov)}</td>
                  <td className="p-2 text-right">{fmtUSD(r.expenses)}</td>
                  <td className={`p-2 text-right ${r.profit < 0 ? "text-rose-400" : ""}`}>{fmtUSD(r.profit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex gap-2 p-3">
          <Link href="/sales" className="rounded border px-3 py-1 hover:bg-neutral-900 text-sm">Sales details</Link>
          <Link href="/expenses" className="rounded border px-3 py-1 hover:bg-neutral-900 text-sm">Expenses details</Link>
        </div>
      </section>
    </main>
  );
}
