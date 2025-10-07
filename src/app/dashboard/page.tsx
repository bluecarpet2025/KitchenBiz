import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import Link from "next/link";

import { createServerClient } from "@/lib/supabase/server";
import { SalesVsExpensesChart, ExpenseDonut, TopItemsChart, currency } from "./charts";

/* ---------------- small date helpers ---------------- */
const pad = (n: number) => String(n).padStart(2, "0");
const todayStr = (d = new Date()) => d.toISOString().slice(0, 10); // YYYY-MM-DD
const monthStr = (d = new Date()) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
const yearStr = (d = new Date()) => `${d.getUTCFullYear()}`;
// ISO week label, used for server views that expose 'IYYY-Www'
function weekStr(d = new Date()) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((+date - +yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

/* ---------------- server action: set goal ---------------- */
async function setGoal(formData: FormData) {
  "use server";
  const raw = (formData.get("goal") ?? "").toString().trim();
  const num = Number.isFinite(Number(raw)) ? Math.max(0, Math.round(Number(raw))) : 0;
  const c = await cookies();
  c.set("kb_goal", String(num), { path: "/", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/dashboard");
}

/* ---------------- helpers (RLS uses effective tenant) ---------------- */
async function getTenantId() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: prof } = await supabase
    .from("profiles")
    .select("tenant_id, use_demo")
    .eq("id", user.id)
    .maybeSingle();

  // if your DB function get_effective_tenant() is already in place you can use it instead
  // here we simply return tenant_id; demo is handled by RLS in your setup
  return (prof?.tenant_id as string | null) ?? null;
}

async function sumOne(
  view: string,
  periodField: "day" | "week" | "month" | "year",
  key: string,
  tenantId: string,
  column: "revenue" | "total" | "orders"
): Promise<number> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from(view)
    .select(column)
    .eq("tenant_id", tenantId)
    .eq(periodField, key)
    .maybeSingle();
  return Number((data as any)?.[column] ?? 0);
}

async function daySeries(
  view: string,
  tenantId: string,
  since: string,
  column: "revenue" | "total"
): Promise<Array<{ day: string; amount: number }>> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from(view)
    .select(`day, ${column}`)
    .eq("tenant_id", tenantId)
    .gte("day", since)
    .order("day", { ascending: true });
  return (data ?? []).map((r: any) => ({ day: r.day as string, amount: Number(r[column] ?? 0) }));
}

async function expenseBreakdown(
  tenantId: string,
  startISO: string,
  endISO: string
): Promise<Array<{ name: string; value: number }>> {
  const supabase = await createServerClient();
  // Pull raw expenses in window; group in app
  const { data } = await supabase
    .from("expenses")
    .select("category, amount_usd, occurred_at, created_at")
    .eq("tenant_id", tenantId)
    .gte("coalesce(occurred_at, created_at)", startISO)
    .lt("coalesce(occurred_at, created_at)", endISO);

  const map = new Map<string, number>();
  for (const r of data ?? []) {
    const cat = (r as any).category ?? "Misc";
    const amt = Number((r as any).amount_usd ?? 0);
    map.set(cat, (map.get(cat) ?? 0) + amt);
  }
  return Array.from(map, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

async function topItems(
  tenantId: string,
  startISO: string,
  endISO: string
): Promise<Array<{ name: string; value: number }>> {
  // Use RPC-less join with RLS and server-side group
  const supabase = await createServerClient();
  const { data: orders } = await supabase
    .from("sales_orders")
    .select("id, occurred_at, created_at")
    .eq("tenant_id", tenantId)
    .gte("coalesce(occurred_at, created_at)", startISO)
    .lt("coalesce(occurred_at, created_at)", endISO);

  if (!orders || orders.length === 0) return [];

  const ids = orders.map((o: any) => o.id);
  // Pull lines in batches
  const { data: lines } = await supabase
    .from("sales_order_lines")
    .select("order_id, product_name, qty, unit_price")
    .in("order_id", ids.slice(0, 10_000)); // safety guard

  const byName = new Map<string, number>();
  for (const l of lines ?? []) {
    const name = (l as any).product_name ?? "Unknown";
    const qty = Number((l as any).qty ?? 0);
    const price = Number((l as any).unit_price ?? 0);
    byName.set(name, (byName.get(name) ?? 0) + qty * price);
  }
  return Array.from(byName, ([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);
}

/* ---------------- Page ---------------- */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: { [k: string]: string | string[] | undefined };
}) {
  const supabase = await createServerClient();
  const tenantId = (await getTenantId()) ?? "";

  // range toggle
  const sp = await searchParams;
  const range = (typeof sp?.range === "string" ? sp.range : "month") as "today" | "week" | "month" | "ytd";

  // read goal cookie
  const c = await cookies();
  const goal = Number(c.get("kb_goal")?.value ?? 10000) || 10000;

  // now / period keys
  const now = new Date();
  const keyDay = todayStr(now);
  const keyWeek = weekStr(now);
  const keyMonth = monthStr(now);
  const keyYear = yearStr(now);

  // SALES/ORDERS for current range
  let salesThis = 0;
  let ordersThis = 0;
  if (range === "today") {
    salesThis = await sumOne("v_sales_day_totals", "day", keyDay, tenantId, "revenue");
    ordersThis = await sumOne("v_sales_day_totals", "day", keyDay, tenantId, "orders");
  } else if (range === "week") {
    salesThis = await sumOne("v_sales_week_totals", "week", keyWeek, tenantId, "revenue");
    ordersThis = await sumOne("v_sales_week_totals", "week", keyWeek, tenantId, "orders");
  } else if (range === "ytd") {
    salesThis = await sumOne("v_sales_year_totals", "year", keyYear, tenantId, "revenue");
    ordersThis = await sumOne("v_sales_year_totals", "year", keyYear, tenantId, "orders");
  } else {
    salesThis = await sumOne("v_sales_month_totals", "month", keyMonth, tenantId, "revenue");
    ordersThis = await sumOne("v_sales_month_totals", "month", keyMonth, tenantId, "orders");
  }

  // EXPENSES for current range
  let expensesThis = 0;
  if (range === "today") {
    expensesThis = await sumOne("v_expense_day_totals", "day", keyDay, tenantId, "total");
  } else if (range === "week") {
    expensesThis = await sumOne("v_expense_week_totals", "week", keyWeek, tenantId, "total");
  } else if (range === "ytd") {
    expensesThis = await sumOne("v_expense_year_totals", "year", keyYear, tenantId, "total");
  } else {
    expensesThis = await sumOne("v_expense_month_totals", "month", keyMonth, tenantId, "total");
  }

  const profitThis = salesThis - expensesThis;
  const aov = ordersThis > 0 ? salesThis / ordersThis : 0;

  // MoM deltas (we’ll compute prior month aggregates for the top 3 KPIs)
  const prevMonthKey = (() => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    d.setUTCMonth(d.getUTCMonth() - 1);
    return monthStr(d);
  })();

  const lastMonthSales = await sumOne("v_sales_month_totals", "month", prevMonthKey, tenantId, "revenue");
  const lastMonthExp = await sumOne("v_expense_month_totals", "month", prevMonthKey, tenantId, "total");
  const lastMonthProfit = lastMonthSales - lastMonthExp;

  const mom = (cur: number, prev: number) => {
    if (!prev) return 0;
    return ((cur - prev) / prev) * 100;
  };
  const salesMoM = mom(salesThis, range === "month" ? lastMonthSales : 0);
  const expMoM = mom(expensesThis, range === "month" ? lastMonthExp : 0);
  const profitMoM = mom(profitThis, range === "month" ? lastMonthProfit : 0);

  // Chart payloads
  // 12 periods based on the toggle
  let xLabel = "months";
  let series: Array<{ key: string; sales: number; expenses: number; profit: number }> = [];
  if (range === "today") {
    xLabel = "days";
    // last 12 days
    const start = new Date(now);
    start.setUTCDate(start.getUTCDate() - 11);
    const sales = await daySeries("v_sales_day_totals", tenantId, todayStr(start), "revenue");
    const exps = await daySeries("v_expense_day_totals", tenantId, todayStr(start), "total");
    const by = (rows: any[], field: string) => Object.fromEntries(rows.map((r) => [r.day, r.amount]));
    const sm = by(sales, "day");
    const em = by(exps, "day");
    const keys: string[] = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(start);
      d.setUTCDate(start.getUTCDate() + i);
      keys.push(todayStr(d));
    }
    series = keys.map((k) => {
      const s = Number(sm[k] ?? 0);
      const e = Number(em[k] ?? 0);
      return { key: k, sales: s, expenses: e, profit: s - e };
    });
  } else if (range === "week") {
    xLabel = "weeks";
    // 12 weeks (labels friendly: IYYY-Www)
    const keys: string[] = [];
    const ref = new Date(now);
    for (let i = 11; i >= 0; i--) {
      const d = new Date(ref);
      d.setUTCDate(ref.getUTCDate() - i * 7);
      keys.push(weekStr(d));
    }
    const fetchFor = async (view: string, col: "revenue" | "total") => {
      const supa = await createServerClient();
      const { data } = await supa
        .from(view)
        .select(`week, ${col}`)
        .eq("tenant_id", tenantId)
        .in("week", keys);
      return Object.fromEntries((data ?? []).map((r: any) => [r.week, Number(r[col] ?? 0)]));
    };
    const sMap = await fetchFor("v_sales_week_totals", "revenue");
    const eMap = await fetchFor("v_expense_week_totals", "total");
    series = keys.map((k) => {
      const s = Number(sMap[k] ?? 0);
      const e = Number(eMap[k] ?? 0);
      return { key: k, sales: s, expenses: e, profit: s - e };
    });
  } else if (range === "ytd") {
    xLabel = "months";
    // months from Jan..current
    const months: string[] = [];
    for (let m = 0; m <= now.getUTCMonth(); m++) {
      months.push(`${now.getUTCFullYear()}-${pad(m + 1)}`);
    }
    const sup = await createServerClient();
    const { data: s } = await sup
      .from("v_sales_month_totals")
      .select("month, revenue")
      .eq("tenant_id", tenantId)
      .in("month", months);
    const { data: e } = await sup
      .from("v_expense_month_totals")
      .select("month, total")
      .eq("tenant_id", tenantId)
      .in("month", months);
    const sm = Object.fromEntries((s ?? []).map((r: any) => [r.month, Number(r.revenue ?? 0)]));
    const em = Object.fromEntries((e ?? []).map((r: any) => [r.month, Number(r.total ?? 0)]));
    series = months.map((k) => {
      const sv = Number(sm[k] ?? 0);
      const ev = Number(em[k] ?? 0);
      return { key: k, sales: sv, expenses: ev, profit: sv - ev };
    });
  } else {
    xLabel = "months";
    // last 12 months
    const keys: string[] = [];
    const ref = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    for (let i = 11; i >= 0; i--) {
      const d = new Date(ref);
      d.setUTCMonth(ref.getUTCMonth() - i);
      keys.push(monthStr(d));
    }
    const sup = await createServerClient();
    const { data: s } = await sup
      .from("v_sales_month_totals")
      .select("month, revenue")
      .eq("tenant_id", tenantId)
      .in("month", keys);
    const { data: e } = await sup
      .from("v_expense_month_totals")
      .select("month, total")
      .eq("tenant_id", tenantId)
      .in("month", keys);
    const sm = Object.fromEntries((s ?? []).map((r: any) => [r.month, Number(r.revenue ?? 0)]));
    const em = Object.fromEntries((e ?? []).map((r: any) => [r.month, Number(r.total ?? 0)]));
    series = keys.map((k) => {
      const sv = Number(sm[k] ?? 0);
      const ev = Number(em[k] ?? 0);
      return { key: k, sales: sv, expenses: ev, profit: sv - ev };
    });
  }

  // Expense donut + legend (window by range)
  const windowStartEnd = (() => {
    if (range === "today") {
      const s = todayStr(now);
      const e = todayStr(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)));
      return [s, e];
    }
    if (range === "week") {
      // Week start Monday — ISO
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
      const mon = new Date(d);
      mon.setUTCDate(d.getUTCDate() - 3);
      const sun = new Date(mon);
      sun.setUTCDate(mon.getUTCDate() + 7);
      return [todayStr(mon), todayStr(sun)];
    }
    if (range === "ytd") {
      const s = `${now.getUTCFullYear()}-01-01`;
      const e = todayStr(new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1)));
      return [s, e];
    }
    // month
    const s = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const e = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    return [todayStr(s), todayStr(e)];
  })();

  const donutData = await expenseBreakdown(tenantId, windowStartEnd[0], windowStartEnd[1]);

  // Top items (range)
  const items = await topItems(tenantId, windowStartEnd[0], windowStartEnd[1]);

  // Last 4 months table (quick look)
  const monthsTable: string[] = [];
  const firstOfThis = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  for (let i = 3; i >= 0; i--) {
    const d = new Date(firstOfThis);
    d.setUTCMonth(firstOfThis.getUTCMonth() - i);
    monthsTable.push(monthStr(d));
  }
  const sup = await createServerClient();
  const { data: sT } = await sup
    .from("v_sales_month_totals")
    .select("month, revenue, orders")
    .eq("tenant_id", tenantId)
    .in("month", monthsTable);
  const { data: eT } = await sup
    .from("v_expense_month_totals")
    .select("month, total")
    .eq("tenant_id", tenantId)
    .in("month", monthsTable);

  const mapSales = Object.fromEntries(
    (sT ?? []).map((r: any) => [r.month, { sales: Number(r.revenue ?? 0), orders: Number(r.orders ?? 0) }])
  );
  const mapExp = Object.fromEntries((eT ?? []).map((r: any) => [r.month, Number(r.total ?? 0)]));

  const rows = monthsTable.map((m) => {
    const s = mapSales[m]?.sales ?? 0;
    const o = mapSales[m]?.orders ?? 0;
    const a = o > 0 ? s / o : 0;
    const x = mapExp[m] ?? 0;
    return { period: m, aov: a, orders: o, sales: s, expenses: x, profit: s - x };
  });

  // little helpers
  const badge = (pct: number) => {
    const col = pct >= 0 ? "text-emerald-400" : "text-rose-400";
    const sign = pct >= 0 ? "+" : "";
    return <div className={`text-xs ${col}`}>{`${sign}${pct.toFixed(1)}% MoM`}</div>;
  };

  const rangeLink = (label: string, r: "today" | "week" | "month" | "ytd") => {
    const active = range === r;
    return (
      <Link
        href={`/dashboard?range=${r}`}
        className={`px-2 py-1 text-sm rounded border ${active ? "bg-neutral-900" : "hover:bg-neutral-900"}`}
      >
        {label}
      </Link>
    );
  };

  return (
    <main className="max-w-6xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <div className="flex gap-2">{rangeLink("Today", "today")}{rangeLink("Week", "week")}{rangeLink("Month", "month")}{rangeLink("YTD", "ytd")}</div>
      </div>

      {/* Top KPIs */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="border rounded p-4">
          <div className="text-xs opacity-70 uppercase"> {range.toUpperCase()} — SALES</div>
          <div className="text-2xl font-semibold">{currency(salesThis)}</div>
          {range === "month" ? badge(salesMoM) : <div className="h-4" />}
        </div>
        <div className="border rounded p-4">
          <div className="text-xs opacity-70 uppercase"> {range.toUpperCase()} — EXPENSES</div>
          <div className="text-2xl font-semibold">{currency(expensesThis)}</div>
          {range === "month" ? badge(expMoM) : <div className="h-4" />}
        </div>
        <div className="border rounded p-4">
          <div className="text-xs opacity-70 uppercase"> {range.toUpperCase()} — PROFIT / LOSS</div>
          <div className={`text-2xl font-semibold ${profitThis < 0 ? "text-rose-400" : ""}`}>{currency(profitThis)}</div>
          {range === "month" ? badge(profitMoM) : <div className="h-4" />}
        </div>
        <div className="border rounded p-4">
          <div className="text-xs opacity-70 uppercase"> SALES vs GOAL</div>
          <div className="text-2xl font-semibold">{currency(salesThis)}</div>
          <div className="flex items-center gap-2 mt-2">
            <form action={setGoal} className="flex items-center gap-2">
              <input
                name="goal"
                defaultValue={goal}
                className="w-24 rounded border bg-transparent px-2 py-1 text-sm"
                title="Monthly goal (used only to show progress)"
              />
              <button className="rounded border px-2 py-1 text-sm hover:bg-neutral-900">Save</button>
            </form>
          </div>
          <div className="mt-2 text-xs opacity-70">Goal {currency(goal)}</div>
          <div className="h-2 mt-2 rounded bg-neutral-800">
            <div
              className="h-2 rounded bg-pink-500"
              style={{ width: `${Math.min(100, (salesThis / Math.max(1, goal)) * 100)}%` }}
            />
          </div>
        </div>
      </section>

      {/* Secondary KPIs */}
      <section className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="border rounded p-3" title="Orders (M): total number of orders in the current range.">
          <div className="text-xs opacity-70 uppercase">ORDERS (M)</div>
          <div className="text-xl font-semibold tabular-nums">{ordersThis}</div>
        </div>
        <div className="border rounded p-3" title="Average Order Value (AOV): sales / orders for the current range.">
          <div className="text-xs opacity-70 uppercase">AOV (M)</div>
          <div className="text-xl font-semibold tabular-nums">{currency(aov)}</div>
        </div>
        <div className="border rounded p-3" title="Food %: demo metric; wire up to recipe/COGS logic later.">
          <div className="text-xs opacity-70 uppercase">FOOD %</div>
          <div className="text-xl font-semibold tabular-nums">—</div>
        </div>
        <div className="border rounded p-3" title="Labor %: demo metric; wire up to payroll/timecards later.">
          <div className="text-xs opacity-70 uppercase">LABOR %</div>
          <div className="text-xl font-semibold tabular-nums">—</div>
        </div>
        <div className="border rounded p-3" title="Prime %: Food + Labor; demo metric until detailed costs are added.">
          <div className="text-xs opacity-70 uppercase">PRIME %</div>
          <div className="text-xl font-semibold tabular-nums">—</div>
        </div>
      </section>

      {/* Charts */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SalesVsExpensesChart data={series} xLabel={xLabel} />
        <ExpenseDonut data={donutData} />
      </section>

      {/* Weekday revenue + Top items */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="border rounded p-3">
          <div className="text-sm opacity-80 mb-2">Weekday revenue (this month)</div>
          <WeekdayBars tenantId={tenantId} />
        </div>
        <TopItemsChart data={items} />
      </section>

      {/* Bottom table */}
      <section className="border rounded">
        <div className="px-4 py-3 border-b text-sm opacity-80">Last 4 months (quick look)</div>
        <div className="px-4 py-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="opacity-80">
              <tr className="text-left">
                <th className="font-normal">Period</th>
                <th className="font-normal text-right">AOV</th>
                <th className="font-normal text-right">Orders</th>
                <th className="font-normal text-right">Sales</th>
                <th className="font-normal text-right">Expenses</th>
                <th className="font-normal text-right">Profit</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.period} className="border-t">
                  <td className="py-1">
                    <Link href={`/sales?month=${r.period}`} className="underline">{r.period}</Link>
                  </td>
                  <td className="py-1 text-right tabular-nums">{currency(r.aov)}</td>
                  <td className="py-1 text-right tabular-nums">{r.orders}</td>
                  <td className="py-1 text-right tabular-nums">{currency(r.sales)}</td>
                  <td className="py-1 text-right tabular-nums">{currency(r.expenses)}</td>
                  <td className={`py-1 text-right tabular-nums ${r.profit < 0 ? "text-rose-400" : ""}`}>
                    {currency(r.profit)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 pb-4 flex gap-2">
          <Link href="/sales" className="rounded border px-3 py-1 hover:bg-neutral-900 text-sm">Sales details</Link>
          <Link href="/expenses" className="rounded border px-3 py-1 hover:bg-neutral-900 text-sm">Expenses details</Link>
        </div>
      </section>
    </main>
  );
}

/* ---------------- server component (weekday bars) ---------------- */
async function WeekdayBars({ tenantId }: { tenantId: string }) {
  const supabase = await createServerClient();
  // current month window
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  // pull sales days for month
  const { data } = await supabase
    .from("v_sales_day_totals")
    .select("day, revenue")
    .eq("tenant_id", tenantId)
    .gte("day", todayStr(start))
    .lt("day", todayStr(end))
    .order("day");

  const byDow = new Array(7).fill(0);
  for (const r of data ?? []) {
    const d = new Date(String((r as any).day) + "T00:00:00Z");
    const dow = d.getUTCDay(); // 0..6
    byDow[dow] += Number((r as any).revenue ?? 0);
  }
  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const rows = labels.map((name, i) => ({ name, value: byDow[i] }));

  const max = Math.max(1, ...rows.map((r) => r.value));

  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.name} className="flex items-center gap-3">
          <div className="w-10 opacity-80 text-sm">{r.name}</div>
          <div className="flex-1 h-3 bg-neutral-800 rounded overflow-hidden">
            <div className="h-3 bg-neutral-200" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
          <div className="w-24 text-right tabular-nums text-sm">{currency(r.value)}</div>
        </div>
      ))}
    </div>
  );
}
