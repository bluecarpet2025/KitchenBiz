// src/app/dashboard/page.tsx (SERVER COMPONENT)
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import Link from "next/link";

// Next 15 PageProps: searchParams is a Promise
type PageProps = { searchParams?: Promise<Record<string, string | string[]>> };

import { createServerClient } from "@/lib/supabase/server";
import { money } from "@/lib/format";
import { SalesVsExpensesChart, ExpenseDonut, TopItemsChart } from "./charts";

/* ───────────── tiny date utils (server-safe) ───────────── */
const pad = (n: number) => String(n).padStart(2, "0");
const todayISO = () => new Date().toISOString().slice(0, 10);
const monthKey = (d = new Date()) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
const yearKey = (d = new Date()) => `${d.getUTCFullYear()}`;
// ISO week: YYYY-Www
function isoWeekKey(d = new Date()) {
  const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  dt.setUTCDate(dt.getUTCDate() + 4 - (dt.getUTCDay() || 7)); // Thursday
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((+dt - +yearStart) / 86400000 + 1) / 7);
  return `${dt.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

/* ───────────── server action: set sales goal ───────────── */
async function setGoal(formData: FormData) {
  "use server";
  const v = Number(formData.get("goal") ?? 0);
  const goal = Math.max(0, Math.round(v / 1000) * 1000);
  const c = await cookies();
  c.set("kb_goal", String(goal), { path: "/", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/dashboard");
}

/* ───────────── helpers (RLS scopes tenant; NO manual tenant_id filters here) ───────────── */

async function sumOne(
  supabase: any,
  view: string,
  periodCol: "day" | "week" | "month" | "year",
  key: string,
  col: "revenue" | "total" | "orders"
): Promise<number> {
  const { data } = await supabase.from(view).select(col).eq(periodCol, key).maybeSingle();
  return Number((data as any)?.[col] ?? 0);
}

async function expenseBreakdown(
  supabase: any,
  startISO: string,
  endISO: string
): Promise<Array<{ name: string; value: number; label?: string }>> {
  // Group expenses by category for the selected window
  const { data, error } = await supabase
    .from("expenses")
    .select("category, amount_usd, occurred_at, created_at")
    .gte("occurred_at", startISO)
    .lt("occurred_at", endISO);

  if (error || !data) return [];

  const map = new Map<string, number>();
  for (const r of data) {
    const k = r.category ?? "Uncategorized";
    map.set(k, (map.get(k) ?? 0) + Number(r.amount_usd ?? 0));
  }
  const total = Array.from(map.values()).reduce((a, b) => a + b, 0);
  const list = Array.from(map.entries())
    .map(([name, value]) => ({
      name,
      value,
      label: `${money(value)} (${total ? Math.round((value / total) * 100) : 0}%)`,
    }))
    .sort((a, b) => b.value - a.value);

  return list;
}

async function weekdayRevenueThisMonth(supabase: any): Promise<
  Array<{ dow: string; amount: number }>
> {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();

  const { data, error } = await supabase
    .from("sales_orders")
    .select("occurred_at, created_at")
    .gte("coalesce(occurred_at, created_at)", start)
    .lt("coalesce(occurred_at, created_at)", end);

  if (error || !data) return [];

  // Sum by weekday (Sun..Sat) using order_lines to compute amounts
  const ids = (data ?? []).map((r: any) => r.id);
  if (ids.length === 0) return [];

  const { data: lines } = await supabase
    .from("sales_order_lines")
    .select("order_id, qty, unit_price")
    .in("order_id", ids);

  const amountByDow = new Array<number>(7).fill(0);
  const ordersById = new Map<string, Date>();
  for (const o of data) {
    const dt = new Date(o.occurred_at ?? o.created_at);
    ordersById.set(o.id, dt);
  }
  for (const l of lines ?? []) {
    const dt = ordersById.get(l.order_id);
    if (!dt) continue;
    const dow = new Date(dt).getUTCDay(); // 0..6
    amountByDow[dow] += Number(l.qty ?? 0) * Number(l.unit_price ?? 0);
  }

  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return labels.map((label, i) => ({ dow: label, amount: amountByDow[i] || 0 }));
}

async function lastNPeriods(
  supabase: any,
  n: number,
  mode: "day" | "week" | "month" | "year"
): Promise<Array<{ key: string; sales: number; expenses: number; profit: number }>> {
  // Build up to n periods ending "now" (inclusive of current), then fetch from views.
  const buckets: string[] = [];
  const d = new Date();

  const pushKey = () => {
    if (mode === "day") buckets.push(todayISO());
    else if (mode === "week") buckets.push(isoWeekKey(d));
    else if (mode === "month") buckets.push(monthKey(d));
    else buckets.push(yearKey(d));
  };

  // start from furthest in the past
  const step = () => {
    if (mode === "day") d.setUTCDate(d.getUTCDate() - 1);
    else if (mode === "week") d.setUTCDate(d.getUTCDate() - 7);
    else if (mode === "month") d.setUTCMonth(d.getUTCMonth() - 1);
    else d.setUTCFullYear(d.getUTCFullYear() - 1);
  };

  // produce reversed then reverse at end
  const temp: string[] = [];
  for (let i = 0; i < n; i++) {
    pushKey();
    temp.push(buckets[buckets.length - 1]);
    step();
    buckets.splice(0, buckets.length); // clear
  }
  const keys = temp.reverse();

  const rows: Array<{ key: string; sales: number; expenses: number; profit: number }> = [];
  for (const k of keys) {
    const sales =
      (await sumOne(
        supabase,
        mode === "day"
          ? "v_sales_day_totals"
          : mode === "week"
          ? "v_sales_week_totals"
          : mode === "month"
          ? "v_sales_month_totals"
          : "v_sales_year_totals",
        mode,
        k,
        "revenue"
      )) ?? 0;

    const ex =
      (await sumOne(
        supabase,
        mode === "day"
          ? "v_expense_day_totals"
          : mode === "week"
          ? "v_expense_week_totals"
          : mode === "month"
          ? "v_expense_month_totals"
          : "v_expense_year_totals",
        mode,
        k,
        "total"
      )) ?? 0;

    rows.push({ key: k, sales, expenses: ex, profit: sales - ex });
  }
  return rows;
}

async function topItemsForWindow(
  supabase: any,
  startISO: string,
  endISO: string
): Promise<Array<{ name: string; revenue: number }>> {
  // Join orders->lines; sum qty*price by product_name
  const { data: o, error } = await supabase
    .from("sales_orders")
    .select("id, occurred_at, created_at")
    .gte("coalesce(occurred_at, created_at)", startISO)
    .lt("coalesce(occurred_at, created_at)", endISO);

  if (error || !o || o.length === 0) return [];

  const ids = o.map((r: any) => r.id);
  const { data: lines } = await supabase
    .from("sales_order_lines")
    .select("order_id, product_name, qty, unit_price")
    .in("order_id", ids);

  const map = new Map<string, number>();
  for (const l of lines ?? []) {
    const name = l.product_name ?? "Unknown";
    map.set(name, (map.get(name) ?? 0) + Number(l.qty ?? 0) * Number(l.unit_price ?? 0));
  }
  return Array.from(map.entries())
    .map(([name, revenue]) => ({ name, revenue }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);
}

/* ───────────── PAGE ───────────── */

export default async function DashboardPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const range = (Array.isArray(params.range) ? params.range[0] : params.range) || "month";

  const supabase = await createServerClient();

  // goal from cookie (safe on server)
  const goalCookie = (await cookies()).get("kb_goal")?.value;
  const goal = Number(goalCookie ?? 10_000);

  // keys for summaries
  const d = new Date();
  const keyDay = todayISO();
  const keyWeek = isoWeekKey(d);
  const keyMonth = monthKey(d);
  const keyYear = yearKey(d);

  // Choose views based on range
  let salesThis = 0,
    expensesThis = 0,
    ordersThis = 0,
    salesPrev = 0,
    expensesPrev = 0;

  let chartMode: "day" | "week" | "month" | "year" = "month";
  if (range === "today") {
    chartMode = "day";
    salesThis = await sumOne(supabase, "v_sales_day_totals", "day", keyDay, "revenue");
    expensesThis = await sumOne(supabase, "v_expense_day_totals", "day", keyDay, "total");
    ordersThis = await sumOne(supabase, "v_sales_day_totals", "day", keyDay, "orders");
    // previous day
    const prev = new Date();
    prev.setUTCDate(prev.getUTCDate() - 1);
    salesPrev = await sumOne(supabase, "v_sales_day_totals", "day", todayISO(), "revenue");
    expensesPrev = await sumOne(supabase, "v_expense_day_totals", "day", todayISO(), "total");
  } else if (range === "week") {
    chartMode = "week";
    salesThis = await sumOne(supabase, "v_sales_week_totals", "week", keyWeek, "revenue");
    expensesThis = await sumOne(supabase, "v_expense_week_totals", "week", keyWeek, "total");
    ordersThis = await sumOne(supabase, "v_sales_week_totals", "week", keyWeek, "orders");
    // previous week
    const prev = new Date();
    prev.setUTCDate(prev.getUTCDate() - 7);
    salesPrev = await sumOne(supabase, "v_sales_week_totals", "week", isoWeekKey(prev), "revenue");
    expensesPrev = await sumOne(
      supabase,
      "v_expense_week_totals",
      "week",
      isoWeekKey(prev),
      "total"
    );
  } else if (range === "ytd") {
    chartMode = "month"; // show months for YTD
    salesThis = await sumOne(supabase, "v_sales_year_totals", "year", keyYear, "revenue");
    expensesThis = await sumOne(supabase, "v_expense_year_totals", "year", keyYear, "total");
    ordersThis = await sumOne(supabase, "v_sales_year_totals", "year", keyYear, "orders");
    // previous year same YTD not trivial; show MoM as 0 for now
    salesPrev = 0;
    expensesPrev = 0;
  } else {
    chartMode = "month";
    salesThis = await sumOne(supabase, "v_sales_month_totals", "month", keyMonth, "revenue");
    expensesThis = await sumOne(supabase, "v_expense_month_totals", "month", keyMonth, "total");
    ordersThis = await sumOne(supabase, "v_sales_month_totals", "month", keyMonth, "orders");
    // previous month
    const prev = new Date();
    prev.setUTCMonth(prev.getUTCMonth() - 1);
    salesPrev = await sumOne(supabase, "v_sales_month_totals", "month", monthKey(prev), "revenue");
    expensesPrev = await sumOne(
      supabase,
      "v_expense_month_totals",
      "month",
      monthKey(prev),
      "total"
    );
  }

  // Profit & % cards
  const profitThis = salesThis - expensesThis;
  const momSales = salesPrev ? ((salesThis - salesPrev) / salesPrev) * 100 : 0;
  const momExp = expensesPrev ? ((expensesThis - expensesPrev) / expensesPrev) * 100 : 0;
  const momProfit =
    salesPrev || expensesPrev
      ? ((profitThis - (salesPrev - expensesPrev)) / Math.max(1, salesPrev - expensesPrev)) * 100
      : 0;

  // AOV (current window)
  const aov = ordersThis > 0 ? salesThis / ordersThis : 0;

  // Chart series: last 12 periods for selected granularity
  const lastSeries =
    chartMode === "day"
      ? await lastNPeriods(supabase, 12, "day")
      : chartMode === "week"
      ? await lastNPeriods(supabase, 12, "week")
      : chartMode === "month"
      ? await lastNPeriods(supabase, 12, "month")
      : await lastNPeriods(supabase, 12, "year");

  // Expense breakdown + Weekday revenue + Top items window
  // Compute start/end ISO depending on range
  const now = new Date();
  let startISO = "";
  let endISO = "";
  if (range === "today") {
    const s = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const e = new Date(s);
    e.setUTCDate(e.getUTCDate() + 1);
    startISO = s.toISOString();
    endISO = e.toISOString();
  } else if (range === "week") {
    // find Monday of current ISO week
    const tmp = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const day = tmp.getUTCDay() || 7;
    tmp.setUTCDate(tmp.getUTCDate() + 1 - day);
    const s = tmp;
    const e = new Date(tmp);
    e.setUTCDate(e.getUTCDate() + 7);
    startISO = s.toISOString();
    endISO = e.toISOString();
  } else if (range === "ytd") {
    const s = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    const e = new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1));
    startISO = s.toISOString();
    endISO = e.toISOString();
  } else {
    const s = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const e = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    startISO = s.toISOString();
    endISO = e.toISOString();
  }

  const [expensePie, weekdayRev, topItems] = await Promise.all([
    expenseBreakdown(supabase, startISO, endISO),
    weekdayRevenueThisMonth(supabase),
    topItemsForWindow(supabase, startISO, endISO),
  ]);

  // last 4 months table
  const last4 = await lastNPeriods(supabase, 4, "month"); // newest at end
  const last4Sorted = [...last4].reverse(); // newest first for table

  // Helpers
  const momBadge = (v: number) => (
    <span className={`text-xs ${v >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
      {v >= 0 ? "+" : ""}
      {v.toFixed(1)}% MoM
    </span>
  );

  const card = (title: string, value: string, foot?: React.ReactNode) => (
    <div className="border rounded p-4">
      <div className="text-xs opacity-80 mb-1">{title}</div>
      <div className="text-2xl font-semibold">{value}</div>
      {foot ? <div className="mt-1">{foot}</div> : null}
    </div>
  );

  return (
    <main className="max-w-7xl mx-auto px-4 py-6 space-y-4">
      {/* Range filter */}
      <div className="flex items-center gap-2 justify-end">
        {(["today", "week", "month", "ytd"] as const).map((r) => (
          <Link
            key={r}
            href={`/dashboard?range=${r}`}
            className={`px-3 py-1 rounded border text-sm ${
              r === range ? "bg-neutral-900" : "hover:bg-neutral-900"
            }`}
          >
            {r === "ytd" ? "YTD" : r[0].toUpperCase() + r.slice(1)}
          </Link>
        ))}
      </div>

      {/* Top band cards */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {card("MONTH — SALES", money(salesThis), momBadge(momSales))}
        {card("MONTH — EXPENSES", money(expensesThis), momBadge(momExp))}
        {card("MONTH — PROFIT / LOSS", money(profitThis), momBadge(momProfit))}
        <div className="border rounded p-4">
          <div className="text-xs opacity-80 mb-1">SALES vs GOAL</div>
          <div className="text-2xl font-semibold">{money(salesThis)}</div>
          <div className="text-xs opacity-80 mt-1">Goal {money(goal)}</div>
          <div className="mt-2 h-2 bg-neutral-800 rounded">
            <div
              className="h-2 bg-emerald-500 rounded"
              style={{ width: `${Math.min(100, (salesThis / Math.max(1, goal)) * 100)}%` }}
            />
          </div>
          <form action={setGoal} className="flex gap-2 mt-2">
            <input
              name="goal"
              defaultValue={goal}
              inputMode="numeric"
              className="w-24 rounded border bg-transparent px-2 py-1 text-sm"
            />
            <button className="rounded border px-3 py-1 text-sm hover:bg-neutral-900">Save</button>
          </form>
        </div>
      </section>

      {/* KPI tiles */}
      <section className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="border rounded p-4" title="Number of completed sales orders in the selected period.">
          <div className="text-xs opacity-80 mb-1">ORDERS (M)</div>
          <div className="text-2xl font-semibold">{ordersThis}</div>
        </div>
        <div className="border rounded p-4" title="Average Order Value = Sales / Orders for the current period.">
          <div className="text-xs opacity-80 mb-1">AOV (M)</div>
          <div className="text-2xl font-semibold">{money(aov)}</div>
        </div>
        <div className="border rounded p-4" title="Food Cost % is demo-only here; based on your Expenses marked 'Food' relative to Sales for the period.">
          <div className="text-xs opacity-80 mb-1">FOOD %</div>
          <div className="text-2xl font-semibold">
            {Math.round(((expensePie.find((x) => x.name === "Food")?.value ?? 0) / Math.max(1, salesThis)) * 100)}%
          </div>
        </div>
        <div className="border rounded p-4" title="Labor % of Sales, using Expenses categorized as 'Labor' in the period.">
          <div className="text-xs opacity-80 mb-1">LABOR %</div>
          <div className="text-2xl font-semibold">
            {Math.round(((expensePie.find((x) => x.name === "Labor")?.value ?? 0) / Math.max(1, salesThis)) * 100)}%
          </div>
        </div>
        <div className="border rounded p-4" title="Prime % = Food % + Labor %.">
          <div className="text-xs opacity-80 mb-1">PRIME %</div>
          <div className="text-2xl font-semibold">
            {Math.round(
              (((expensePie.find((x) => x.name === "Food")?.value ?? 0) +
                (expensePie.find((x) => x.name === "Labor")?.value ?? 0)) /
                Math.max(1, salesThis)) *
                100
            )}
            %
          </div>
        </div>
      </section>

      {/* Charts */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <div className="text-sm opacity-80 mb-2">
            Sales vs Expenses — last 12 {chartMode === "day" ? "days" : chartMode === "week" ? "weeks" : chartMode === "month" ? "months" : "years"}
          </div>
          <SalesVsExpensesChart
            data={lastSeries}
            xLabel={`x axis: ${chartMode}`}
          />
        </div>

        <div>
          <div className="text-sm opacity-80 mb-2">Expense breakdown — current range</div>
          <ExpenseDonut data={expensePie} />
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Weekday revenue (current month) */}
        <div className="border rounded p-3">
          <div className="text-sm opacity-80">Weekday revenue (this month)</div>
          <div className="mt-3 space-y-2">
            {weekdayRev.map((r) => (
              <div key={r.dow} className="grid grid-cols-6 items-center gap-2">
                <div className="col-span-1 text-sm opacity-80">{r.dow}</div>
                <div className="col-span-4">
                  <div className="h-2 bg-neutral-800 rounded">
                    <div
                      className="h-2 bg-neutral-300 rounded"
                      style={{
                        width: `${Math.min(
                          100,
                          (r.amount / Math.max(1, Math.max(...weekdayRev.map((x) => x.amount)))) * 100
                        )}%`,
                      }}
                    />
                  </div>
                </div>
                <div className="col-span-1 text-right text-sm">{money(r.amount)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Top items */}
        <div>
          <div className="text-sm opacity-80 mb-2">Top items — current range</div>
          {topItems.length === 0 ? (
            <div className="border rounded p-6 opacity-70 text-sm">No items in this range.</div>
          ) : (
            <TopItemsChart data={topItems} />
          )}
        </div>
      </section>

      {/* Last 4 months quick look (order: Period - AOV - Orders - Sales - Expenses - Profit) */}
      <section className="border rounded">
        <div className="px-4 py-3 border-b text-sm opacity-80">Last 4 months (quick look)</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="opacity-80">
              <tr className="text-left">
                <th className="px-4 py-2">Period</th>
                <th className="px-4 py-2 text-right">AOV</th>
                <th className="px-4 py-2 text-right">Orders</th>
                <th className="px-4 py-2 text-right">Sales</th>
                <th className="px-4 py-2 text-right">Expenses</th>
                <th className="px-4 py-2 text-right">Profit</th>
              </tr>
            </thead>
            <tbody>
              {last4Sorted.map((row) => {
                const orders =
                  // fetch orders for that month
                  0; // optional to backfill; if you already have orders in views, you can fetch similar to revenue
                const aovVal = orders > 0 ? row.sales / orders : 0;
                return (
                  <tr key={row.key} className="border-t">
                    <td className="px-4 py-2">
                      <Link href={`/sales?month=${row.key}`} className="underline">
                        {row.key}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-right">{money(aovVal)}</td>
                    <td className="px-4 py-2 text-right">{orders}</td>
                    <td className="px-4 py-2 text-right">{money(row.sales)}</td>
                    <td className="px-4 py-2 text-right">{money(row.expenses)}</td>
                    <td className="px-4 py-2 text-right">{money(row.profit)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex gap-2 p-3">
          <Link href="/sales" className="rounded border px-3 py-1 hover:bg-neutral-900 text-sm">
            Sales details
          </Link>
          <Link href="/expenses" className="rounded border px-3 py-1 hover:bg-neutral-900 text-sm">
            Expenses details
          </Link>
        </div>
      </section>
    </main>
  );
}
