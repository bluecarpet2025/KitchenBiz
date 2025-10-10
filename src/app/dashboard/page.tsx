import "server-only";
import Link from "next/link";
import { cookies } from "next/headers";
import { createServerClient } from "@/lib/supabase/server";
import { SalesVsExpenses, ExpenseDonut, TopItems, WeekdayBars } from "./ClientCharts";

/* ------------------------------ small utils ------------------------------ */
const pad2 = (n: number) => String(n).padStart(2, "0");
const fmtDay = (d: Date) => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
const fmtMonth = (d: Date) => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
const fmtYear = (d: Date) => String(d.getUTCFullYear());
const usd = (n: number) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(Number(n) || 0);

const addDays = (d: Date, n: number) => {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() + n);
  return x;
};
function isoWeekString(d: Date) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() + 4 - (x.getUTCDay() || 7));
  const yStart = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((+x - +yStart) / 86400000 + 1) / 7);
  return `${x.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

/* ------------------------------ helpers (DB) ------------------------------ */
async function getProfileAndTenant(supabase: any) {
  const { data: u } = await supabase.auth.getUser();
  const uid = u?.user?.id;
  if (!uid) return { uid: null, tenantId: null, goal: 0, use_demo: false };

  const { data: prof } = await supabase
    .from("profiles")
    .select("tenant_id, use_demo, goal_month_usd")
    .eq("id", uid)
    .maybeSingle();

  return {
    uid,
    tenantId: prof?.tenant_id ?? null,
    goal: Number(prof?.goal_month_usd ?? 0),
    use_demo: !!prof?.use_demo,
  };
}

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

/* Grouped expenses within [start,end) in SQL */
async function expenseBreakdownSQL(
  supabase: any,
  tenantId: string | null,
  startIso: string,
  endIso: string
): Promise<Array<{ name: string; value: number }>> {
  if (!tenantId) return [];
  const { data } = await supabase
    .from("expenses")
    .select("category, amount_usd")
    .eq("tenant_id", tenantId)
    .gte("occurred_at", `${startIso}T00:00:00Z`)
    .lt("occurred_at", `${endIso}T00:00:00Z`);

  const bucket = new Map<string, number>();
  for (const r of (data ?? []) as any[]) {
    const k = (r.category?.trim() || "Misc") as string;
    bucket.set(k, (bucket.get(k) || 0) + Number(r.amount_usd || 0));
  }
  return [...bucket.entries()].map(([name, value]) => ({ name, value }));
}

/* Weekday totals for the current calendar month (UTC) via view */
async function weekdayRevenueThisMonth(supabase: any): Promise<{ labels: string[]; values: number[] }> {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const endExcl = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  const { data } = await supabase
    .from("v_sales_day_totals")
    .select("day, revenue")
    .gte("day", fmtDay(start))
    .lt("day", fmtDay(endExcl))
    .order("day", { ascending: true });

  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const vals = [0, 0, 0, 0, 0, 0, 0];
  for (const r of (data ?? []) as any[]) {
    const d = new Date(`${r.day}T00:00:00Z`);
    vals[d.getUTCDay()] += Number(r.revenue || 0);
  }
  return { labels, values: vals };
}

/* Top items aggregated in SQL and limited to 8 */
async function topItemsForRangeSQL(
  supabase: any,
  tenantId: string | null,
  startIso: string,
  endIso: string
): Promise<Array<{ name: string; value: number }>> {
  if (!tenantId) return [];
  const { data } = await supabase
    .from("sales_order_lines")
    .select("product_name, revenue:qty, unit_price, order:sales_orders!inner(id, tenant_id, occurred_at)")
    .gte("order.occurred_at", `${startIso}T00:00:00Z`)
    .lt("order.occurred_at", `${endIso}T00:00:00Z`)
    .eq("order.tenant_id", tenantId);

  // When using PostgREST joins, we can’t alias computed cols, so compute here.
  const bucket = new Map<string, number>();
  for (const row of (data ?? []) as any[]) {
    const name = String(row.product_name ?? "Unknown");
    const revenue = (Number(row.qty || 0) * Number(row.unit_price || 0)) || 0;
    bucket.set(name, (bucket.get(name) || 0) + revenue);
  }
  return [...bucket.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
}

/* ------------------------- server action: save goal ------------------------ */
async function setGoal(formData: FormData) {
  "use server";
  const raw = String(formData.get("goal") ?? "0").trim();
  const newGoal = Math.max(0, Math.round(Number(raw || 0)));
  const supabase = await createServerClient();
  const { data: u } = await supabase.auth.getUser();
  const uid = u?.user?.id;
  if (uid) {
    await supabase.from("profiles").update({ goal_month_usd: newGoal }).eq("id", uid);
  }
  // also store in cookie for instant UI feedback
  const c = await cookies();
  c.set("_kb_goal", String(newGoal), { path: "/", maxAge: 60 * 60 * 24 * 365 });
}

/* ================================== PAGE ================================== */
export default async function DashboardPage(props: any) {
  const supabase = await createServerClient();
  const { uid, tenantId, goal: profileGoal } = await getProfileAndTenant(supabase);

  // range
  const sp = (await props?.searchParams) ?? props?.searchParams ?? {};
  const range = (typeof sp.range === "string" ? sp.range : Array.isArray(sp.range) ? sp.range[0] : null) ?? "month";

  const now = new Date();
  const today = fmtDay(now);
  const thisWeek = isoWeekString(now);
  const thisMonth = fmtMonth(now);
  const thisYear = fmtYear(now);

  // canonical [start, end)
  let startIso = today;
  let endIsoExcl = fmtDay(addDays(now, 1));
  if (range === "week") {
    startIso = fmtDay(addDays(now, -6));
    endIsoExcl = fmtDay(addDays(now, 1));
  } else if (range === "month") {
    const s = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const e = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    startIso = fmtDay(s);
    endIsoExcl = fmtDay(e);
  } else if (range === "ytd") {
    const s = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    const e = new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1));
    startIso = fmtDay(s);
    endIsoExcl = fmtDay(e);
  }

  // headline aggregates (from views)
  const [salesVal, expVal, ordersVal] = await (async () => {
    if (range === "today") {
      return Promise.all([
        sumOne(supabase, "v_sales_day_totals", "day", today, "revenue"),
        sumOne(supabase, "v_expense_day_totals", "day", today, "total"),
        sumOne(supabase, "v_sales_day_totals", "day", today, "orders"),
      ]);
    } else if (range === "week") {
      return Promise.all([
        sumOne(supabase, "v_sales_week_totals", "week", thisWeek, "revenue"),
        sumOne(supabase, "v_expense_week_totals", "week", thisWeek, "total"),
        sumOne(supabase, "v_sales_week_totals", "week", thisWeek, "orders"),
      ]);
    } else if (range === "ytd") {
      return Promise.all([
        sumOne(supabase, "v_sales_year_totals", "year", thisYear, "revenue"),
        sumOne(supabase, "v_expense_year_totals", "year", thisYear, "total"),
        sumOne(supabase, "v_sales_year_totals", "year", thisYear, "orders"),
      ]);
    } else {
      return Promise.all([
        sumOne(supabase, "v_sales_month_totals", "month", thisMonth, "revenue"),
        sumOne(supabase, "v_expense_month_totals", "month", thisMonth, "total"),
        sumOne(supabase, "v_sales_month_totals", "month", thisMonth, "orders"),
      ]);
    }
  })();

  const profitVal = salesVal - expVal;
  const aov = ordersVal > 0 ? salesVal / ordersVal : 0;

  // breakdowns & charts
  const breakdown = await expenseBreakdownSQL(supabase, tenantId, startIso, endIsoExcl);
  const weekday = await weekdayRevenueThisMonth(supabase);
  const topItems = await topItemsForRangeSQL(supabase, tenantId, startIso, endIsoExcl);

  // goal (profile first, cookie override second)
  const goalCookie = (await cookies()).get("_kb_goal")?.value;
  const goal = Math.max(0, Math.round(Number(goalCookie ?? profileGoal ?? 0)));

  // last 4 months table
  const months: string[] = [];
  for (let i = 3; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push(fmtMonth(d));
  }
  const last4 = await Promise.all(
    months.map(async (m) => {
      const [s, e, o] = await Promise.all([
        sumOne(supabase, "v_sales_month_totals", "month", m, "revenue"),
        sumOne(supabase, "v_expense_month_totals", "month", m, "total"),
        sumOne(supabase, "v_sales_month_totals", "month", m, "orders"),
      ]);
      return { key: m, aov: o > 0 ? s / o : 0, orders: o, sales: s, expenses: e, profit: s - e };
    })
  );

  // line series
  const series: Array<{ key: string; sales: number; expenses: number; profit: number }> = [];
  if (range === "today") {
    // last 12 days ending today (UTC)
    for (let i = 11; i >= 0; i--) {
      const d = fmtDay(addDays(now, -i));
      const [s, e] = await Promise.all([
        sumOne(supabase, "v_sales_day_totals", "day", d, "revenue"),
        sumOne(supabase, "v_expense_day_totals", "day", d, "total"),
      ]);
      series.push({ key: d, sales: s, expenses: e, profit: s - e });
    }
  } else if (range === "week") {
    for (let i = 11; i >= 0; i--) {
      const wk = isoWeekString(addDays(now, -7 * i));
      const [s, e] = await Promise.all([
        sumOne(supabase, "v_sales_week_totals", "week", wk, "revenue"),
        sumOne(supabase, "v_expense_week_totals", "week", wk, "total"),
      ]);
      series.push({ key: wk, sales: s, expenses: e, profit: s - e });
    }
  } else if (range === "ytd") {
    for (let m = 0; m <= now.getUTCMonth(); m++) {
      const mk = fmtMonth(new Date(Date.UTC(now.getUTCFullYear(), m, 1)));
      const [s, e] = await Promise.all([
        sumOne(supabase, "v_sales_month_totals", "month", mk, "revenue"),
        sumOne(supabase, "v_expense_month_totals", "month", mk, "total"),
      ]);
      series.push({ key: mk, sales: s, expenses: e, profit: s - e });
    }
  } else {
    // last 12 months ending current month
    for (let i = 11; i >= 0; i--) {
      const mk = fmtMonth(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)));
      const [s, e] = await Promise.all([
        sumOne(supabase, "v_sales_month_totals", "month", mk, "revenue"),
        sumOne(supabase, "v_expense_month_totals", "month", mk, "total"),
      ]);
      series.push({ key: mk, sales: s, expenses: e, profit: s - e });
    }
  }

  // deltas — compare to previous matching period
  const pct = (nowV: number, prevV: number) =>
    prevV === 0 ? (nowV > 0 ? 100 : 0) : Math.round(((nowV - prevV) / prevV) * 100);

  let salesDelta = 0, expDelta = 0, profDelta = 0;
  if (range === "today") {
    const prevKey = fmtDay(addDays(now, -1));
    const [ps, pe] = await Promise.all([
      sumOne(supabase, "v_sales_day_totals", "day", prevKey, "revenue"),
      sumOne(supabase, "v_expense_day_totals", "day", prevKey, "total"),
    ]);
    salesDelta = pct(salesVal, ps);
    expDelta = pct(expVal, pe);
    profDelta = pct(profitVal, ps - pe);
  } else if (range === "week") {
    const prevKey = isoWeekString(addDays(now, -7));
    const [ps, pe] = await Promise.all([
      sumOne(supabase, "v_sales_week_totals", "week", prevKey, "revenue"),
      sumOne(supabase, "v_expense_week_totals", "week", prevKey, "total"),
    ]);
    salesDelta = pct(salesVal, ps);
    expDelta = pct(expVal, pe);
    profDelta = pct(profitVal, ps - pe);
  } else if (range === "ytd") {
    const prevYear = String(now.getUTCFullYear() - 1);
    const [ps, pe] = await Promise.all([
      sumOne(supabase, "v_sales_year_totals", "year", prevYear, "revenue"),
      sumOne(supabase, "v_expense_year_totals", "year", prevYear, "total"),
    ]);
    salesDelta = pct(salesVal, ps);
    expDelta = pct(expVal, pe);
    profDelta = pct(profitVal, ps - pe);
  } else {
    const prevMonth = fmtMonth(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)));
    const [ps, pe] = await Promise.all([
      sumOne(supabase, "v_sales_month_totals", "month", prevMonth, "revenue"),
      sumOne(supabase, "v_expense_month_totals", "month", prevMonth, "total"),
    ]);
    salesDelta = pct(salesVal, ps);
    expDelta = pct(expVal, pe);
    profDelta = pct(profitVal, ps - pe);
  }

  return (
    <main className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2">
          <Link href="/dashboard?range=today" className={`rounded border px-3 py-1 ${range === "today" ? "bg-neutral-900" : ""}`}>Today</Link>
          <Link href="/dashboard?range=week"  className={`rounded border px-3 py-1 ${range === "week"  ? "bg-neutral-900" : ""}`}>Week</Link>
          <Link href="/dashboard?range=month" className={`rounded border px-3 py-1 ${range === "month" ? "bg-neutral-900" : ""}`}>Month</Link>
          <Link href="/dashboard?range=ytd"   className={`rounded border px-3 py-1 ${range === "ytd"   ? "bg-neutral-900" : ""}`}>YTD</Link>
        </div>
        <div className="text-xs px-2 py-1 rounded border opacity-80">Range: {startIso} → {endIsoExcl}</div>
      </div>

      {/* headline */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="border rounded-2xl p-4">
          <div className="text-xs opacity-70 tracking-wide">SALES — {range.toUpperCase()}</div>
          <div className="text-2xl font-semibold mt-1">{usd(salesVal)}</div>
          <div className={`text-xs mt-1 ${salesDelta >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
            {salesDelta >= 0 ? `+${salesDelta}%` : `${salesDelta}%`} vs prev
          </div>
        </div>
        <div className="border rounded-2xl p-4">
          <div className="text-xs opacity-70 tracking-wide">EXPENSES — {range.toUpperCase()}</div>
          <div className="text-2xl font-semibold mt-1">{usd(expVal)}</div>
          <div className={`text-xs mt-1 ${expDelta >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
            {expDelta >= 0 ? `+${expDelta}%` : `${expDelta}%`} vs prev
          </div>
        </div>
        <div className="border rounded-2xl p-4">
          <div className="text-xs opacity-70 tracking-wide">PROFIT / LOSS — {range.toUpperCase()}</div>
          <div className={`text-2xl font-semibold mt-1 ${profitVal < 0 ? "text-rose-400" : ""}`}>{usd(profitVal)}</div>
          <div className={`text-xs mt-1 ${profDelta >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
            {profDelta >= 0 ? `+${profDelta}%` : `${profDelta}%`} vs prev
          </div>
        </div>
        <div className="border rounded-2xl p-4">
          <div className="text-xs opacity-70 tracking-wide">SALES vs GOAL</div>
          <div className="text-2xl font-semibold mt-1">{usd(salesVal)}</div>
          <div className="text-xs opacity-70">Goal {usd(goal)}</div>
          <div className="w-full h-1.5 bg-neutral-800 rounded mt-2">
            <div className="h-1.5 bg-emerald-500 rounded" style={{ width: `${goal > 0 ? Math.min(100, Math.round((salesVal / goal) * 100)) : 0}%` }} />
          </div>
          <form action={setGoal} className="mt-2 flex gap-2">
            <input name="goal" defaultValue={goal || ""} className="bg-transparent border rounded px-2 py-1 text-sm w-24" />
            <button className="border rounded px-2 py-1 text-sm hover:bg-neutral-900">Save</button>
          </form>
        </div>
      </section>

      {/* KPI row */}
      <section className="grid grid-cols-1 md:grid-cols-5 gap-4 mt-4">
        <div className="border rounded-2xl p-4" title="Orders in the selected range.">
          <div className="text-xs opacity-70">ORDERS (∑)</div>
          <div className="text-2xl font-semibold">{ordersVal}</div>
        </div>
        <div className="border rounded-2xl p-4" title="Average Order Value = Sales / Orders (this range).">
          <div className="text-xs opacity-70">AOV (∑)</div>
          <div className="text-2xl font-semibold">{usd(aov)}</div>
        </div>
        <div className="border rounded-2xl p-4" title="Food cost percentage = Food expenses / Sales (this range).">
          <div className="text-xs opacity-70">FOOD %</div>
          <div className="text-2xl font-semibold">
            {(() => {
              const food = breakdown.find((x) => x.name?.toLowerCase() === "food")?.value ?? 0;
              return `${Math.round((food / Math.max(1, salesVal)) * 100)}%`;
            })()}
          </div>
        </div>
        <div className="border rounded-2xl p-4" title="Labor percentage = Labor expenses / Sales (this range).">
          <div className="text-xs opacity-70">LABOR %</div>
          <div className="text-2xl font-semibold">
            {(() => {
              const labor = breakdown.find((x) => x.name?.toLowerCase() === "labor")?.value ?? 0;
              return `${Math.round((labor / Math.max(1, salesVal)) * 100)}%`;
            })()}
          </div>
        </div>
        <div className="border rounded-2xl p-4" title="Prime cost = Food % + Labor %.">
          <div className="text-xs opacity-70">PRIME %</div>
          <div className="text-2xl font-semibold">
            {(() => {
              const food = breakdown.find((x) => x.name?.toLowerCase() === "food")?.value ?? 0;
              const labor = breakdown.find((x) => x.name?.toLowerCase() === "labor")?.value ?? 0;
              return `${Math.round(((food + labor) / Math.max(1, salesVal)) * 100)}%`;
            })()}
          </div>
        </div>
      </section>

      {/* charts */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <div className="border rounded-2xl p-4">
          <div className="text-xs opacity-70 mb-2">
            Sales vs Expenses — {range === "today" ? "last 12 days" : range === "week" ? "last 12 weeks" : range === "ytd" ? "YTD (by month)" : "last 12 months"}
          </div>
          <SalesVsExpenses data={series} />
        </div>
        <div className="border rounded-2xl p-4">
          <div className="text-xs opacity-70 mb-2">Expense breakdown — current range</div>
          <ExpenseDonut data={breakdown} />
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <div className="border rounded-2xl p-4">
          <div className="text-xs opacity-70 mb-2">Weekday revenue (this month)</div>
          <WeekdayBars labels={weekday.labels} values={weekday.values} />
        </div>
        <div className="border rounded-2xl p-4">
          <div className="text-xs opacity-70 mb-2">Top items — current range</div>
          <TopItems data={topItems} />
        </div>
      </section>

      {/* bottom table */}
      <section className="mt-6 border rounded-2xl">
        <div className="px-4 py-3 border-b text-xs opacity-70">Last 4 months (quick look)</div>
        <div className="px-4 py-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="opacity-80">
              <tr>
                <th className="text-left font-normal px-2 py-1">Period</th>
                <th className="text-right font-normal px-2 py-1">AOV</th>
                <th className="text-right font-normal px-2 py-1">Orders</th>
                <th className="text-right font-normal px-2 py-1">Sales</th>
                <th className="text-right font-normal px-2 py-1">Expenses</th>
                <th className="text-right font-normal px-2 py-1">Profit</th>
              </tr>
            </thead>
            <tbody>
              {last4.map((r) => (
                <tr key={r.key} className="border-t">
                  <td className="px-2 py-1">{r.key}</td>
                  <td className="px-2 py-1 text-right">{usd(r.aov)}</td>
                  <td className="px-2 py-1 text-right">{r.orders}</td>
                  <td className="px-2 py-1 text-right">{usd(r.sales)}</td>
                  <td className="px-2 py-1 text-right">{usd(r.expenses)}</td>
                  <td className={`px-2 py-1 text-right ${r.profit < 0 ? "text-rose-400" : ""}`}>{usd(r.profit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex gap-2 mt-4">
            <Link href="/sales" className="rounded border px-3 py-1 hover:bg-neutral-900 text-sm">Sales details</Link>
            <Link href="/expenses" className="rounded border px-3 py-1 hover:bg-neutral-900 text-sm">Expenses details</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
