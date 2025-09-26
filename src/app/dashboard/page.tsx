import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { SalesVsExpensesChart, ExpenseDonut, TopItemsBar } from "./charts";

/** ---------------- small utils ---------------- */
function pad(n: number) { return String(n).padStart(2, "0"); }
function toDateUTC(d: Date) { return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); }
function startOfMonth(d = new Date()) { return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)); }
function endOfMonthExclusive(d = new Date()) { return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)); }
function startOfISOWeek(d = new Date()) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() - (day - 1));
  return t;
}
function addMonths(d: Date, n: number) { return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate())); }
function monthKey(d = new Date()) { return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`; }
function yearKey(d = new Date()) { return String(d.getUTCFullYear()); }
const fmtUSD = (n: number) => (n || 0).toLocaleString(undefined, { style: "currency", currency: "USD" });
const fmtPct0 = (v: number) => `${(isFinite(v) ? v : 0).toFixed(0)}%`;
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** generic view aggregator */
async function sumOne(
  supabase: any,
  view: string,
  period: "day" | "week" | "month" | "year",
  key: string,
  tenantId: string | null,
  col: string
): Promise<number> {
  if (!tenantId) return 0;
  const { data } = await supabase
    .from(view)
    .select(col)
    .eq("tenant_id", tenantId)
    .eq(period, key)
    .maybeSingle();
  return num((data as any)?.[col]);
}

/** range helpers */
type Range = "today" | "week" | "month" | "ytd";
function resolveRange(r?: string): Range {
  if (r === "today" || r === "week" || r === "ytd") return r;
  return "month";
}
function rangeDates(r: Range, now = new Date()) {
  const N = toDateUTC(now);
  if (r === "today") return { start: N, end: new Date(Date.UTC(N.getUTCFullYear(), N.getUTCMonth(), N.getUTCDate() + 1)) };
  if (r === "week") {
    const s = startOfISOWeek(N);
    return { start: s, end: new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate() + 7)) };
  }
  if (r === "ytd") {
    const s = new Date(Date.UTC(N.getUTCFullYear(), 0, 1));
    return { start: s, end: endOfMonthExclusive(N) };
  }
  return { start: startOfMonth(N), end: endOfMonthExclusive(N) };
}

/** expenses sum for date range (UTC) with optional category filter */
async function sumExpenses(
  supabase: any,
  tenantId: string | null,
  start: Date,
  end: Date,
  category?: string
): Promise<number> {
  if (!tenantId) return 0;
  let q = supabase
    .from("expenses")
    .select("amount_usd")
    .eq("tenant_id", tenantId)
    .gte("occurred_at", start.toISOString())
    .lt("occurred_at", end.toISOString());
  if (category) q = q.eq("category", category);
  const { data } = await q;
  return Array.isArray(data) ? data.reduce((a: number, r: any) => a + num(r.amount_usd), 0) : 0;
}

/** expense breakdown list */
async function expenseBreakdown(
  supabase: any,
  tenantId: string | null,
  start: Date,
  end: Date
): Promise<Array<{ name: string; value: number }>> {
  if (!tenantId) return [];
  const { data } = await supabase
    .from("expenses")
    .select("category, amount_usd")
    .eq("tenant_id", tenantId)
    .gte("occurred_at", start.toISOString())
    .lt("occurred_at", end.toISOString());
  const map = new Map<string, number>();
  (data ?? []).forEach((r: any) => {
    const key = r.category || "Other";
    map.set(key, (map.get(key) || 0) + num(r.amount_usd));
  });
  // top 5 + Other
  const sorted = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, 5).map(([name, value]) => ({ name, value }));
  const rest = sorted.slice(5).reduce((a, [, v]) => a + v, 0);
  if (rest > 0) top.push({ name: "Other", value: rest });
  return top;
}

/** weekday revenue for current month (bars) */
async function weekdayRevenueThisMonth(
  supabase: any,
  tenantId: string | null,
  start: Date,
  end: Date
): Promise<{ label: string; amount: number }[]> {
  if (!tenantId) return [];
  const { data } = await supabase
    .from("v_sales_day_totals")
    .select("day, revenue")
    .eq("tenant_id", tenantId)
    .gte("day", start.toISOString().slice(0, 10))
    .lt("day", end.toISOString().slice(0, 10));
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const buckets = new Array(7).fill(0);
  (data ?? []).forEach((r: any) => {
    const d = new Date(r.day + "T00:00:00Z");
    buckets[d.getUTCDay()] += num(r.revenue);
  });
  return names.map((n, i) => ({ label: n, amount: buckets[i] || 0 }));
}

/** top items (by revenue) in current range */
async function topItemsThisRange(
  supabase: any,
  tenantId: string | null,
  start: Date,
  end: Date
): Promise<Array<{ name: string; revenue: number }>> {
  if (!tenantId) return [];
  const { data } = await supabase
    .from("sales_order_lines")
    .select("product, qty, unit_price, sales_orders!inner(tenant_id,occurred_at)")
    .eq("sales_orders.tenant_id", tenantId)
    .gte("sales_orders.occurred_at", start.toISOString())
    .lt("sales_orders.occurred_at", end.toISOString());
  const m = new Map<string, number>();
  (data ?? []).forEach((r: any) => {
    const rev = num(r.qty) * num(r.unit_price);
    const key = r.product || "Unknown";
    m.set(key, (m.get(key) || 0) + rev);
  });
  return Array.from(m.entries())
    .map(([name, revenue]) => ({ name, revenue }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 7);
}

/** ---------- server action: save goal (local) ---------- */
async function updateGoal(formData: FormData) {
  "use server";
  const supabase = await createServerClient();
  const val = Number(formData.get("goal"));
  if (!Number.isFinite(val)) return;
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return;
  await supabase.from("profiles").update({ goal_month_usd: val }).eq("id", auth.user.id);
}

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[]>>;
}) {
  const supabase = await createServerClient();
  const params = await searchParams;
  const range = resolveRange(typeof params.range === "string" ? params.range : undefined);

  // goal & tenant
  const { data: auth } = await supabase.auth.getUser();
  let goal: number = 15000;
  if (auth?.user) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("goal_month_usd")
      .eq("id", auth.user.id)
      .maybeSingle();
    if (Number.isFinite(Number(prof?.goal_month_usd))) goal = Number(prof?.goal_month_usd);
  }
  const { data: effTenant } = await supabase.rpc("get_effective_tenant");
  const tenantId: string | null = (effTenant as string) ?? null;

  const now = toDateUTC(new Date());
  const { start, end } = rangeDates(range, now);
  const thisMonth = monthKey(now);
  const prevMonth = monthKey(addMonths(now, -1));
  const thisYear = yearKey(now);

  // SALES & ORDERS (by range)
  let salesThis = 0;
  let ordersThis = 0;

  if (range === "today") {
    const key = start.toISOString().slice(0, 10);
    salesThis = await sumOne(supabase, "v_sales_day_totals", "day", key, tenantId, "revenue");
    ordersThis = await sumOne(supabase, "v_sales_day_totals", "day", key, tenantId, "orders");
  } else if (range === "week") {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + 4 - ((date.getUTCDay() || 7)));
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(((+date - +yearStart) / 86400000 + 1) / 7);
    const weekKey = `${date.getUTCFullYear()}-W${pad(weekNo)}`;
    salesThis = await sumOne(supabase, "v_sales_week_totals", "week", weekKey, tenantId, "revenue");
    ordersThis = await sumOne(supabase, "v_sales_week_totals", "week", weekKey, tenantId, "orders");
  } else if (range === "ytd") {
    salesThis = await sumOne(supabase, "v_sales_year_totals", "year", thisYear, tenantId, "revenue");
    ordersThis = await sumOne(supabase, "v_sales_year_totals", "year", thisYear, tenantId, "orders");
  } else {
    salesThis = await sumOne(supabase, "v_sales_month_totals", "month", thisMonth, tenantId, "revenue");
    ordersThis = await sumOne(supabase, "v_sales_month_totals", "month", thisMonth, tenantId, "orders");
  }

  // EXPENSES (range)
  const expensesThis = await sumExpenses(supabase, tenantId, start, end);
  const profitThis = salesThis - expensesThis;

  // AOV & cost %
  const aov = ordersThis > 0 ? salesThis / ordersThis : 0;
  const [foodThis, laborThis] = await Promise.all([
    sumExpenses(supabase, tenantId, start, end, "Food"),
    sumExpenses(supabase, tenantId, start, end, "Labor"),
  ]);
  const foodPct = salesThis > 0 ? (foodThis / salesThis) * 100 : 0;
  const laborPct = salesThis > 0 ? (laborThis / salesThis) * 100 : 0;
  const primePct = foodPct + laborPct;

  // MoM (month only)
  const salesPrevMonth = range === "month"
    ? await sumOne(supabase, "v_sales_month_totals", "month", prevMonth, tenantId, "revenue")
    : 0;
  const momChange = salesPrevMonth > 0 ? ((salesThis - salesPrevMonth) / salesPrevMonth) * 100 : 0;

  // Visual data
  const [weekday, breakdown, topItems] = await Promise.all([
    weekdayRevenueThisMonth(supabase, tenantId, startOfMonth(now), endOfMonthExclusive(now)),
    expenseBreakdown(supabase, tenantId, start, end),
    topItemsThisRange(supabase, tenantId, start, end),
  ]);
  const maxWeekday = Math.max(1, ...weekday.map((x) => x.amount));

  // Last 12 months (for chart + quick table)
  let sales12: any[] = [];
  let exp12: any[] = [];
  if (tenantId) {
    const { data: s } = await supabase
      .from("v_sales_month_totals")
      .select("month, revenue")
      .eq("tenant_id", tenantId)
      .order("month", { ascending: false })
      .limit(12);
    const { data: e } = await supabase
      .from("v_expense_month_totals")
      .select("month, total")
      .eq("tenant_id", tenantId)
      .order("month", { ascending: false })
      .limit(12);
    sales12 = (s ?? []).slice().reverse();
    exp12 = (e ?? []).slice().reverse();
  }
  const merged12 = merge12(sales12, exp12); // {month, sales, expenses, profit}
  const last4 = merged12.slice(-4);

  return (
    <main className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <div className="flex gap-2">
          <Link href="/sales/import" className="rounded border px-3 py-1 hover:bg-neutral-900 text-sm">Import Sales CSV</Link>
          <Link href="/expenses/import" className="rounded border px-3 py-1 hover:bg-neutral-900 text-sm">Import Expenses CSV</Link>
        </div>
      </div>

      {/* Range selector */}
      <div className="flex gap-2 mb-4">
        {(["today","week","month","ytd"] as Range[]).map((r) => (
          <Link
            key={r}
            href={`/dashboard?range=${r}`}
            className={`px-3 py-1 rounded border text-sm ${range===r ? "bg-neutral-900" : "hover:bg-neutral-900"}`}
            title={`View ${r.toUpperCase()} metrics`}
          >
            {r === "ytd" ? "YTD" : r[0].toUpperCase() + r.slice(1)}
          </Link>
        ))}
      </div>

      {/* Headline cards */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title={`${range.toUpperCase()} — SALES`} value={fmtUSD(salesThis)} />
        <StatCard title={`${range.toUpperCase()} — EXPENSES`} value={fmtUSD(expensesThis)} />
        <StatCard title={`${range.toUpperCase()} — PROFIT / LOSS`} value={fmtUSD(profitThis)} danger={profitThis < 0} />
        <GoalCard value={salesThis} goal={goal} title="SALES vs GOAL" hint="Edit goal; saved to your profile." />
      </section>

      {/* KPIs */}
      <section className="grid grid-cols-1 md:grid-cols-5 gap-4 mt-4">
        <KpiCard label="ORDERS" value={ordersThis.toLocaleString()} />
        <KpiCard label="AOV" value={fmtUSD(aov)} />
        <KpiCard label="FOOD %" value={fmtPct0(foodPct)} />
        <KpiCard label="LABOR %" value={fmtPct0(laborPct)} />
        <KpiCard label="PRIME %" value={fmtPct0(primePct)} />
      </section>

      {/* Visual row: line + donut */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <SalesVsExpensesChart data={merged12} />
        <ExpenseDonut data={breakdown} />
      </section>

      {/* Weekday revenue + Top items */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <div className="border rounded p-4">
          <div className="text-sm opacity-80">Weekday revenue (this month)</div>
          <div className="mt-3 space-y-2">
            {weekday.map((d) => (
              <div key={d.label} className="flex items-center gap-2 text-sm">
                <div className="w-10 opacity-70">{d.label}</div>
                <div className="flex-1 h-2 rounded bg-neutral-800">
                  <div className="h-2 rounded bg-neutral-300" style={{ width: `${(d.amount / maxWeekday) * 100}%` }} />
                </div>
                <div className="w-24 text-right tabular-nums">{fmtUSD(d.amount)}</div>
              </div>
            ))}
          </div>
          {range === "month" && (
            <div className="text-xs opacity-70 mt-3">
              MoM change: <span className={((salesPrevMonth > 0 ? ((salesThis - salesPrevMonth)/salesPrevMonth*100) : 0) < 0) ? "text-rose-400" : ""}>
                {fmtPct0(momChange)}
              </span>
            </div>
          )}
        </div>

        <TopItemsBar data={topItems} />
      </section>

      {/* Quick numbers (compact), last 4 months */}
      <section className="mt-4 border rounded">
        <div className="px-4 py-3 border-b text-sm opacity-80">Last 4 months (quick look)</div>
        <div className="p-4">
          <table className="w-full text-sm">
            <thead className="opacity-80">
              <tr>
                <th className="text-left font-normal">Period</th>
                <th className="text-right font-normal">Sales</th>
                <th className="text-right font-normal">Expenses</th>
                <th className="text-right font-normal">Profit</th>
              </tr>
            </thead>
            <tbody>
              {last4.map((r) => (
                <tr key={r.month} className="border-t">
                  <td className="py-1">
                    <Link className="underline" href={`/sales?month=${r.month}`}>{r.month}</Link>
                  </td>
                  <td className="py-1 text-right tabular-nums">{fmtUSD(r.sales)}</td>
                  <td className="py-1 text-right tabular-nums">{fmtUSD(r.expenses)}</td>
                  <td className={`py-1 text-right tabular-nums ${r.profit < 0 ? "text-rose-400" : ""}`}>{fmtUSD(r.profit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex gap-2 mt-3">
            <Link href="/sales" className="rounded border px-3 py-1 hover:bg-neutral-900 text-sm">Sales details</Link>
            <Link href="/expenses" className="rounded border px-3 py-1 hover:bg-neutral-900 text-sm">Expenses details</Link>
          </div>
        </div>
      </section>
    </main>
  );
}

/* ---------- helpers & small presentational bits ---------- */
function merge12(
  sales12: Array<{ month: string; revenue: number }>,
  exp12: Array<{ month: string; total: number }>
): Array<{ month: string; sales: number; expenses: number; profit: number }> {
  const map = new Map<string, { sales: number; expenses: number }>();
  sales12.forEach((s) => map.set(s.month, { sales: num(s.revenue), expenses: 0 }));
  exp12.forEach((e) => {
    const row = map.get(e.month) || { sales: 0, expenses: 0 };
    row.expenses = num(e.total);
    map.set(e.month, row);
  });
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, v]) => ({ month, sales: v.sales, expenses: v.expenses, profit: v.sales - v.expenses }));
}

function StatCard({ title, value, danger = false }: { title: string; value: string; danger?: boolean }) {
  return (
    <div className="border rounded p-4" title={title}>
      <div className="text-sm opacity-80">{title}</div>
      <div className={`text-2xl font-semibold ${danger ? "text-rose-400" : ""}`}>{value}</div>
    </div>
  );
}
function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border rounded p-4" title={label}>
      <div className="text-xs opacity-80">{label}</div>
      <div className="text-xl font-semibold mt-1">{value}</div>
    </div>
  );
}
async function GoalCard({ value, goal, title, hint }: { value: number; goal: number; title: string; hint?: string }) {
  const pct = Math.min(100, Math.round((value / (goal || 1)) * 100));
  return (
    <div className="border rounded p-4" title={hint || title}>
      <div className="text-sm opacity-80">{title}</div>
      <div className="text-2xl font-semibold">{fmtUSD(value)}</div>
      <div className="mt-2 text-xs opacity-70">Goal {fmtUSD(goal)}</div>
      <div className="mt-2 h-2 rounded bg-neutral-800">
        <div className="h-2 rounded bg-pink-500" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 text-xs opacity-70">{pct}%</div>

      <form action={updateGoal} className="mt-3 flex items-center gap-2" title="Set a new monthly sales goal">
        <input
          name="goal"
          type="number"
          step="100"
          min="0"
          defaultValue={goal}
          className="w-28 rounded border bg-transparent px-2 py-1 text-sm"
        />
        <button className="rounded border px-3 py-1 text-sm hover:bg-neutral-900">Save</button>
      </form>
    </div>
  );
}
