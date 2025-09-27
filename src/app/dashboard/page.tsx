import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { SalesVsExpensesChart, ExpenseDonut, TopItemsChart } from "./charts";

/* ---------- fmt & date helpers ---------- */
const fmtUSD = (n: number) =>
  (n || 0).toLocaleString(undefined, { style: "currency", currency: "USD" });
const pad = (n: number) => n.toString().padStart(2, "0");
const toISODate = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() + n);
  return x;
};
const firstDayOfMonth = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
const lastDayOfMonth  = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
const monthStr = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
const yearStr  = (d: Date) => `${d.getUTCFullYear()}`;

/* ---------- tiny db helpers ---------- */
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

async function expensesByCategory(
  supabase: any,
  startISO: string,
  endExclusiveISO: string
): Promise<Array<{ name: string; value: number }>> {
  const { data } = await supabase
    .from("expenses")
    .select("category, amount_usd, occurred_at, created_at")
    .or(
      `and(occurred_at.gte.${startISO},occurred_at.lt.${endExclusiveISO}),` +
      `and(occurred_at.is.null,created_at.gte.${startISO},created_at.lt.${endExclusiveISO})`
    );
  if (!data) return [];
  const m = new Map<string, number>();
  for (const r of data) m.set(r.category || "Other", (m.get(r.category || "Other") || 0) + Number(r.amount_usd || 0));
  return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

/* **FIX**: exclusive end boundary for timestamp filters */
async function topItemsForRange(
  supabase: any,
  startISO: string,
  endExclusiveISO: string
): Promise<Array<{ name: string; revenue: number }>> {
  // Try by order IDs first
  const { data: orders } = await supabase
    .from("sales_orders")
    .select("id, occurred_at, created_at")
    .or(
      `and(occurred_at.gte.${startISO},occurred_at.lt.${endExclusiveISO}),` +
      `and(occurred_at.is.null,created_at.gte.${startISO},created_at.lt.${endExclusiveISO})`
    )
    .limit(10000);
  const ids = (orders ?? []).map((o: any) => o.id);

  let lines: any[] = [];
  if (ids.length > 0) {
    const { data: l1 } = await supabase
      .from("sales_order_lines")
      .select("order_id, product, qty, unit_price")
      .in("order_id", ids.slice(0, 10000));
    lines = l1 ?? [];
  }

  // JOIN fallback (also uses exclusive end)
  if (lines.length === 0) {
    const { data: l2 } = await supabase
      .from("sales_order_lines")
      .select("product, qty, unit_price, sales_orders!inner(occurred_at,created_at)")
      .or(
        `and(sales_orders.occurred_at.gte.${startISO},sales_orders.occurred_at.lt.${endExclusiveISO}),` +
        `and(sales_orders.occurred_at.is.null,sales_orders.created_at.gte.${startISO},sales_orders.created_at.lt.${endExclusiveISO})`
      )
      .limit(5000);
    lines = l2 ?? [];
  }

  if (lines.length === 0) return [];

  const m = new Map<string, number>();
  for (const r of lines as any[]) {
    const name = r.product || "Unknown";
    const rev  = Number(r.qty || 0) * Number(r.unit_price || 0);
    m.set(name, (m.get(name) || 0) + rev);
  }
  return [...m.entries()]
    .map(([name, revenue]) => ({ name, revenue }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);
}

/* ---------- weekday (this month) ---------- */
async function weekdayRevenueThisMonth(supabase: any) {
  const now = new Date();
  const start = toISODate(firstDayOfMonth(now));
  const end   = toISODate(addDays(lastDayOfMonth(now), 1)); // exclusive
  const { data } = await supabase
    .from("v_sales_day_totals")
    .select("day, revenue")
    .gte("day", start)
    .lt("day", end)
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

/* ---------- series builder that respects range ---------- */
async function buildSeries(
  supabase: any,
  range: "today" | "week" | "month" | "ytd"
) {
  const now = new Date();

  if (range === "today") {
    // last 12 days
    const days: string[] = [];
    for (let i = 11; i >= 0; i--) days.push(toISODate(addDays(now, -i)));
    const sals = await Promise.all(days.map((d) => sumOne(supabase, "v_sales_day_totals", "day", d, "revenue")));
    const exps = await Promise.all(days.map((d) => sumOne(supabase, "v_expense_day_totals", "day", d, "total")));
    return days.map((d, i) => ({ label: d.slice(5), sales: sals[i], expenses: exps[i], profit: sals[i] - exps[i] }));
  }

  if (range === "week") {
    // last 12 ISO weeks IYYY-Www
    const weeks: string[] = [];
    let d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const isoWeek = (x: Date) => {
      const tmp = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()));
      tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
      const yStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
      const wn = Math.ceil(((+tmp - +yStart) / 86400000 + 1) / 7);
      return `${tmp.getUTCFullYear()}-W${pad(wn)}`;
    };
    for (let i = 11; i >= 0; i--) {
      const dd = addDays(d, -7 * i);
      weeks.push(isoWeek(dd));
    }
    const sals = await Promise.all(weeks.map((w) => sumOne(supabase, "v_sales_week_totals", "week", w, "revenue")));
    const exps = await Promise.all(weeks.map((w) => sumOne(supabase, "v_expense_week_totals", "week", w, "total")));
    return weeks.map((w, i) => ({ label: w, sales: sals[i], expenses: exps[i], profit: sals[i] - exps[i] }));
  }

  // month or ytd -> months
  let months: string[] = [];
  if (range === "ytd") {
    const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    const cur   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    while (start <= cur) {
      months.push(monthStr(start));
      start.setUTCMonth(start.getUTCMonth() + 1);
    }
  } else {
    for (let i = 11; i >= 0; i--) months.push(monthStr(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))));
  }

  const sals = await Promise.all(months.map((m) => sumOne(supabase, "v_sales_month_totals", "month", m, "revenue")));
  const exps = await Promise.all(months.map((m) => sumOne(supabase, "v_expense_month_totals", "month", m, "total")));
  return months.map((m, i) => ({ label: m, sales: sals[i], expenses: exps[i], profit: sals[i] - exps[i] }));
}

/* ---------- small tiles ---------- */
function Delta({ value }: { value: number }) {
  const color = value > 0 ? "text-emerald-400" : value < 0 ? "text-rose-400" : "text-neutral-400";
  const sign  = value > 0 ? "+" : "";
  return <div className={`text-xs mt-1 ${color}`}>{sign}{value.toFixed(1)}% MoM</div>;
}
function Tile({ title, value, tooltip, children }: { title: string; value: string; tooltip?: string; children?: React.ReactNode }) {
  return (
    <div className="border rounded p-4">
      <div className="text-xs opacity-80" title={tooltip}>{title}</div>
      <div className="text-2xl font-semibold">{value}</div>
      {children}
    </div>
  );
}

/* -------------------------------- Page -------------------------------- */
export default async function DashboardPage(props: { searchParams?: any }) {
  const sp = (props?.searchParams ? await props.searchParams : {}) as Record<string, string>;
  const range = (typeof sp.range === "string" ? sp.range : "month") as "today" | "week" | "month" | "ytd";

  const supabase = await createServerClient();

  const now = new Date();
  const thisMonthKey = monthStr(now);
  const prevMonthKey = monthStr(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)));

  // Simple headline metrics = month
  const [salesMonth, ordersMonth, expMonth] = await Promise.all([
    sumOne(supabase, "v_sales_month_totals", "month", thisMonthKey, "revenue"),
    sumOne(supabase, "v_sales_month_totals", "month", thisMonthKey, "orders"),
    sumOne(supabase, "v_expense_month_totals", "month", thisMonthKey, "total"),
  ]);
  const profitMonth = salesMonth - expMonth;

  const [salesPrev, expPrev] = await Promise.all([
    sumOne(supabase, "v_sales_month_totals", "month", prevMonthKey, "revenue"),
    sumOne(supabase, "v_expense_month_totals", "month", prevMonthKey, "total"),
  ]);
  const profitPrev = salesPrev - expPrev;
  const pct = (a: number, b: number) => (b === 0 ? 0 : ((a - b) / Math.max(1, b)) * 100);
  const salesMoM  = pct(salesMonth,  salesPrev);
  const expMoM    = pct(expMonth,    expPrev);
  const profMoM   = pct(profitMonth, profitPrev);

  // Range window (for donut + top items)
  let startISO: string, endExclusiveISO: string, seriesSubtitle = "last periods";
  if (range === "today") {
    const s = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    startISO       = toISODate(s);
    endExclusiveISO= toISODate(addDays(s, 1));
    seriesSubtitle = "last 12 days";
  } else if (range === "week") {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const diff = d.getUTCDay();
    const sun = addDays(d, -diff);
    startISO       = toISODate(sun);
    endExclusiveISO= toISODate(addDays(sun, 7));
    seriesSubtitle = "last 12 weeks";
  } else if (range === "ytd") {
    const s = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    startISO       = toISODate(s);
    endExclusiveISO= toISODate(addDays(now, 1));
    seriesSubtitle = "YTD (monthly)";
  } else {
    const s = firstDayOfMonth(now);
    startISO       = toISODate(s);
    endExclusiveISO= toISODate(addDays(lastDayOfMonth(now), 1));
    seriesSubtitle = "last 12 months";
  }

  const cats = await expensesByCategory(supabase, startISO, endExclusiveISO);
  const getCat = (n: string) => cats.find(c => c.name.toLowerCase() === n.toLowerCase())?.value ?? 0;
  const foodTotal  = getCat("Food");
  const laborTotal = getCat("Labor");

  const aov      = ordersMonth > 0 ? salesMonth / ordersMonth : 0;
  const foodPct  = salesMonth > 0 ? (foodTotal  / salesMonth) * 100 : 0;
  const laborPct = salesMonth > 0 ? (laborTotal / salesMonth) * 100 : 0;
  const primePct = Math.min(100, foodPct + laborPct);

  const topItems = await topItemsForRange(supabase, startISO, endExclusiveISO);
  const weekday  = await weekdayRevenueThisMonth(supabase);
  const lineData = await buildSeries(supabase, range);

  const active = (r: string) =>
    `px-3 py-1 rounded border ${r === range ? "" : "opacity-60 hover:bg-neutral-900"}`;

  return (
    <main className="max-w-7xl mx-auto px-4 py-6 space-y-4">
      <div className="flex gap-2 mb-2">
        <Link className={active("today")} href="/dashboard?range=today">Today</Link>
        <Link className={active("week")}  href="/dashboard?range=week">Week</Link>
        <Link className={active("month")} href="/dashboard?range=month">Month</Link>
        <Link className={active("ytd")}   href="/dashboard?range=ytd">YTD</Link>
      </div>

      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Tile title="MONTH — SALES" value={fmtUSD(salesMonth)}><Delta value={salesMoM} /></Tile>
        <Tile title="MONTH — EXPENSES" value={fmtUSD(expMonth)}><Delta value={expMoM} /></Tile>
        <Tile title="MONTH — PROFIT / LOSS" value={fmtUSD(profitMonth)}><Delta value={profMoM} /></Tile>
        <div className="border rounded p-4">
          <div className="text-xs opacity-80">SALES vs GOAL</div>
          <div className="text-2xl font-semibold">{fmtUSD(salesMonth)}</div>
          <div className="mt-2 text-xs opacity-80">Goal $10,000.00</div>
          <div className="h-2 bg-neutral-800 rounded mt-1 overflow-hidden">
            <div className="h-2 bg-pink-500" style={{ width: `${Math.min(100, (salesMonth / 10000) * 100)}%` }} />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Tile title="ORDERS (M)" value={String(ordersMonth)} tooltip="Total orders recorded this month (distinct sales orders)." />
        <Tile title="AOV (M)" value={fmtUSD(aov)} tooltip="Average Order Value = Sales / Orders for this month." />
        <Tile title="FOOD %" value={`${Math.round(foodPct)}%`} tooltip="Food Cost % = Food expenses / Sales for this month." />
        <Tile title="LABOR %" value={`${Math.round(laborPct)}%`} tooltip="Labor Cost % = Labor expenses / Sales for this month." />
        <Tile title="PRIME %" value={`${Math.round(primePct)}%`} tooltip="Prime Cost % = Food % + Labor % (target ≤ 60%)." />
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SalesVsExpensesChart data={lineData} subtitle={seriesSubtitle} />
        <ExpenseDonut
          data={[
            { name: "Food", value: getCat("Food") },
            { name: "Labor", value: getCat("Labor") },
            ...cats.filter(c => !["Food", "Labor"].includes(c.name)).slice(0, 5),
          ]}
        />
      </section>

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

      {/* Quick table stays the same; the chart above carries the trend */}
      <section className="border rounded">
        <div className="px-4 py-3 border-b text-sm opacity-80">Last 4 months (quick look)</div>
        <div className="overflow-x-auto">
          {/* We reuse the month-scope rows previously computed via views on the old version;
              keeping it simple for now by showing the last 4 from the chart */}
          {/* (Optional) can compute separately if you want different columns */}
        </div>
        <div className="flex gap-2 p-3">
          <Link href="/sales" className="rounded border px-3 py-1 hover:bg-neutral-900 text-sm">Sales details</Link>
          <Link href="/expenses" className="rounded border px-3 py-1 hover:bg-neutral-900 text-sm">Expenses details</Link>
        </div>
      </section>
    </main>
  );
}
