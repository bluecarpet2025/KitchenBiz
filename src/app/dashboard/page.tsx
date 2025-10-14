import "server-only";
import { cookies } from "next/headers";
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { SalesVsExpenses, ExpenseDonut, TopItems, WeekdayBars } from "./ClientCharts";
import { effectiveTenantId } from "@/lib/effective-tenant";

/* ---------------- server action: set sales goal in a cookie ---------------- */
async function setGoal(formData: FormData) {
  "use server";
  const raw = String(formData.get("goal") ?? "0").trim();
  const goal = Math.max(0, Math.round(Number(raw || 0)));
  const c = await cookies();
  c.set("_kb_goal", String(goal), { path: "/", maxAge: 60 * 60 * 24 * 365 });
}

/* ------------------------------ date utils -------------------------------- */
const pad2 = (n: number) => String(n).padStart(2, "0");
const fmtDay = (d: Date) => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
const fmtMonth = (d: Date) => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
const fmtYear = (d: Date) => `${d.getUTCFullYear()}`;
const fmtUSD = (n: number) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(Number(n) || 0);

function addDays(d: Date, n: number) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}
function isoWeekString(d: Date) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() + 4 - (x.getUTCDay() || 7));
  const yStart = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((+x - +yStart) / 86400000 + 1) / 7);
  return `${x.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

/* --------------------------- DB helper functions --------------------------- */
async function sumOne(
  supabase: any,
  view: string,
  periodCol: "day" | "week" | "month" | "year",
  key: string,
  tenantId: string | null,
  col: "revenue" | "total" | "orders"
): Promise<number> {
  if (!tenantId) return 0;
  const { data } = await supabase
    .from(view)
    .select(col)
    .eq("tenant_id", tenantId)
    .eq(periodCol, key)
    .maybeSingle();
  return Number((data as any)?.[col] ?? 0);
}

async function expenseBreakdown(
  supabase: any,
  tenantId: string | null,
  startIso: string,
  endIso: string
): Promise<Array<{ name: string; value: number }>> {
  if (!tenantId) return [];
  const { data } = await supabase
    .from("expenses")
    .select("category, amount_usd, occurred_at, created_at, tenant_id")
  ;
  if (!data) return [];
  const start = new Date(startIso + "T00:00:00Z").getTime();
  const end = new Date(endIso + "T00:00:00Z").getTime();
  const bucket = new Map<string, number>();
  for (const row of data as any[]) {
    if (row.tenant_id !== tenantId) continue; // ensure right tenant
    const ts = new Date(row.occurred_at ?? row.created_at).getTime();
    if (ts >= start && ts < end) {
      const k = String(row.category ?? "Misc");
      bucket.set(k, (bucket.get(k) || 0) + Number(row.amount_usd || 0));
    }
  }
  return Array.from(bucket.entries()).map(([name, value]) => ({ name, value }));
}

async function weekdayRevenueThisMonth(
  supabase: any,
  tenantId: string | null
): Promise<{ labels: string[]; values: number[] }> {
  if (!tenantId) return { labels: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], values: [0, 0, 0, 0, 0, 0, 0] };
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const endExcl = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const { data } = await supabase
    .from("v_sales_day_totals")
    .select("day, revenue")
    .eq("tenant_id", tenantId)
    .gte("day", fmtDay(start))
    .lt("day", fmtDay(endExcl))
    .order("day", { ascending: true });
  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const vals = [0, 0, 0, 0, 0, 0, 0];
  for (const r of (data ?? []) as any[]) {
    const d = new Date(r.day + "T00:00:00Z");
    vals[d.getUTCDay()] += Number(r.revenue || 0);
  }
  return { labels, values: vals };
}

async function topItemsForRange(
  supabase: any,
  tenantId: string | null,
  startIso: string,
  endIso: string
): Promise<Array<{ name: string; value: number }>> {
  if (!tenantId) return [];
  const start = new Date(startIso + "T00:00:00Z").getTime();
  const end = new Date(endIso + "T00:00:00Z").getTime();

  // Limit to this tenant’s orders in the range
  const { data: orders } = await supabase
    .from("sales_orders")
    .select("id, occurred_at, created_at, tenant_id")
    .eq("tenant_id", tenantId);

  const keep = new Set(
    (orders ?? [])
      .filter((o: any) => {
        const t = new Date(o.occurred_at ?? o.created_at).getTime();
        return t >= start && t < end && o.tenant_id === tenantId;
      })
      .map((o: any) => o.id as string)
  );

  if (keep.size === 0) return [];

  // Pull only lines that belong to those orders
  const { data: lines } = await supabase
    .from("sales_order_lines")
    .select("product_name, qty, unit_price, order_id");

  const bucket = new Map<string, number>();
  for (const row of (lines ?? []) as any[]) {
    if (!keep.has(row.order_id)) continue;
    const k = String(row.product_name ?? "Unknown");
    const rev = (Number(row.qty || 0) * Number(row.unit_price || 0)) || 0;
    bucket.set(k, (bucket.get(k) || 0) + rev);
  }
  return Array.from(bucket.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
}

/* ================================== PAGE ================================== */
export default async function DashboardPage(props: any) {
  const sp = (await props?.searchParams) ?? props?.searchParams ?? {};
  const range =
    (typeof sp.range === "string" ? sp.range : Array.isArray(sp.range) ? sp.range[0] : null) ?? "month";

  const supabase = await createServerClient();
  const { tenantId } = await effectiveTenantId(supabase); // <<<<<< DEMO-AWARE

  const now = new Date();
  const today = fmtDay(now);
  const thisWeek = isoWeekString(now);
  const thisMonth = fmtMonth(now);
  const thisYear = fmtYear(now);

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

  // headline numbers
  const [salesVal, expVal, ordersVal] = await (async () => {
    if (range === "today") {
      return Promise.all([
        sumOne(supabase, "v_sales_day_totals", "day", today, tenantId, "revenue"),
        sumOne(supabase, "v_expense_day_totals", "day", today, tenantId, "total"),
        sumOne(supabase, "v_sales_day_totals", "day", today, tenantId, "orders"),
      ]);
    } else if (range === "week") {
      return Promise.all([
        sumOne(supabase, "v_sales_week_totals", "week", thisWeek, tenantId, "revenue"),
        sumOne(supabase, "v_expense_week_totals", "week", thisWeek, tenantId, "total"),
        sumOne(supabase, "v_sales_week_totals", "week", thisWeek, tenantId, "orders"),
      ]);
    } else if (range === "ytd") {
      return Promise.all([
        sumOne(supabase, "v_sales_year_totals", "year", thisYear, tenantId, "revenue"),
        sumOne(supabase, "v_expense_year_totals", "year", thisYear, tenantId, "total"),
        sumOne(supabase, "v_sales_year_totals", "year", thisYear, tenantId, "orders"),
      ]);
    } else {
      return Promise.all([
        sumOne(supabase, "v_sales_month_totals", "month", thisMonth, tenantId, "revenue"),
        sumOne(supabase, "v_expense_month_totals", "month", thisMonth, tenantId, "total"),
        sumOne(supabase, "v_sales_month_totals", "month", thisMonth, tenantId, "orders"),
      ]);
    }
  })();

  const profitVal = salesVal - expVal;
  const aov = ordersVal > 0 ? salesVal / ordersVal : 0;

  const breakdown = await expenseBreakdown(supabase, tenantId, startIso, endIsoExcl);
  const weekday = await weekdayRevenueThisMonth(supabase, tenantId);
  const topItems = await topItemsForRange(supabase, tenantId, startIso, endIsoExcl);

  const goalCookie = (await cookies()).get("_kb_goal")?.value;
  const goal = Math.max(0, Math.round(Number(goalCookie || 0)));

  const months: string[] = [];
  for (let i = 3; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push(fmtMonth(d));
  }
  const last4 = await Promise.all(
    months.map(async (m) => {
      const [s, e, o] = await Promise.all([
        sumOne(supabase, "v_sales_month_totals", "month", m, tenantId, "revenue"),
        sumOne(supabase, "v_expense_month_totals", "month", m, tenantId, "total"),
        sumOne(supabase, "v_sales_month_totals", "month", m, tenantId, "orders"),
      ]);
      return { key: m, aov: o > 0 ? s / o : 0, orders: o, sales: s, expenses: e, profit: s - e };
    })
  );

  // series for the big line chart
  const series: Array<{ key: string; sales: number; expenses: number; profit: number }> = [];
  if (range === "today") {
    for (let i = 11; i >= 0; i--) {
      const d = fmtDay(addDays(now, -i));
      const [s, e] = await Promise.all([
        sumOne(supabase, "v_sales_day_totals", "day", d, tenantId, "revenue"),
        sumOne(supabase, "v_expense_day_totals", "day", d, tenantId, "total"),
      ]);
      series.push({ key: d, sales: s, expenses: e, profit: s - e });
    }
  } else if (range === "week") {
    for (let i = 11; i >= 0; i--) {
      const d = addDays(now, -7 * i);
      const wk = isoWeekString(d);
      const [s, e] = await Promise.all([
        sumOne(supabase, "v_sales_week_totals", "week", wk, tenantId, "revenue"),
        sumOne(supabase, "v_expense_week_totals", "week", wk, tenantId, "total"),
      ]);
      series.push({ key: wk, sales: s, expenses: e, profit: s - e });
    }
  } else if (range === "ytd") {
    for (let m = 0; m <= now.getUTCMonth(); m++) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), m, 1));
      const mk = fmtMonth(d);
      const [s, e] = await Promise.all([
        sumOne(supabase, "v_sales_month_totals", "month", mk, tenantId, "revenue"),
        sumOne(supabase, "v_expense_month_totals", "month", mk, tenantId, "total"),
      ]);
      series.push({ key: mk, sales: s, expenses: e, profit: s - e });
    }
  } else {
    for (let i = 11; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const mk = fmtMonth(d);
      const [s, e] = await Promise.all([
        sumOne(supabase, "v_sales_month_totals", "month", mk, tenantId, "revenue"),
        sumOne(supabase, "v_expense_month_totals", "month", mk, tenantId, "total"),
      ]);
      series.push({ key: mk, sales: s, expenses: e, profit: s - e });
    }
  }

  // simple MoM deltas (always by month)
  const prevMonth = fmtMonth(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)));
  const [prevS, prevE] = await Promise.all([
    sumOne(supabase, "v_sales_month_totals", "month", prevMonth, tenantId, "revenue"),
    sumOne(supabase, "v_expense_month_totals", "month", prevMonth, tenantId, "total"),
  ]);
  const prevP = prevS - prevE;
  const pct = (nowV: number, prevV: number) =>
    prevV === 0 ? (nowV > 0 ? 100 : 0) : Math.round(((nowV - prevV) / prevV) * 100);
  const salesMoM = pct(salesVal, prevS);
  const expMoM = pct(expVal, prevE);
  const profMoM = pct(profitVal, prevP);

  return (
    <main className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2">
          <Link href="/dashboard?range=today" className={`rounded border px-3 py-1 ${range === "today" ? "bg-neutral-900" : ""}`}>Today</Link>
          <Link href="/dashboard?range=week" className={`rounded border px-3 py-1 ${range === "week" ? "bg-neutral-900" : ""}`}>Week</Link>
          <Link href="/dashboard?range=month" className={`rounded border px-3 py-1 ${range === "month" ? "bg-neutral-900" : ""}`}>Month</Link>
          <Link href="/dashboard?range=ytd" className={`rounded border px-3 py-1 ${range === "ytd" ? "bg-neutral-900" : ""}`}>YTD</Link>
        </div>
        <div className="text-sm opacity-80">Roman</div>
      </div>

      {/* headline */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="border rounded p-4">
          <div className="text-sm opacity-80">{range === "today" ? "TODAY — SALES" : range === "week" ? "WEEK — SALES" : range === "ytd" ? "YTD — SALES" : "MONTH — SALES"}</div>
          <div className="text-2xl font-semibold">{fmtUSD(salesVal)}</div>
          <div className="text-xs mt-1 text-emerald-400">{salesMoM >= 0 ? `+${salesMoM}% MoM` : `${salesMoM}% MoM`}</div>
        </div>
        <div className="border rounded p-4">
          <div className="text-sm opacity-80">{range === "today" ? "TODAY — EXPENSES" : range === "week" ? "WEEK — EXPENSES" : range === "ytd" ? "YTD — EXPENSES" : "MONTH — EXPENSES"}</div>
          <div className="text-2xl font-semibold">{fmtUSD(expVal)}</div>
          <div className="text-xs mt-1 text-emerald-400">{expMoM >= 0 ? `+${expMoM}% MoM` : `${expMoM}% MoM`}</div>
        </div>
        <div className="border rounded p-4">
          <div className="text-sm opacity-80">{range === "today" ? "TODAY — PROFIT / LOSS" : range === "week" ? "WEEK — PROFIT / LOSS" : range === "ytd" ? "YTD — PROFIT / LOSS" : "MONTH — PROFIT / LOSS"}</div>
          <div className={`text-2xl font-semibold ${profitVal < 0 ? "text-rose-400" : ""}`}>{fmtUSD(profitVal)}</div>
          <div className="text-xs mt-1 text-emerald-400">{profMoM >= 0 ? `+${profMoM}% MoM` : `${profMoM}% MoM`}</div>
        </div>
        <div className="border rounded p-4">
          <div className="text-sm opacity-80">SALES vs GOAL</div>
          <div className="text-2xl font-semibold">{fmtUSD(salesVal)}</div>
          <div className="text-xs opacity-70">Goal {fmtUSD(goal)}</div>
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
        <div className="border rounded p-4" title="Orders (this range). Number of distinct sales orders recorded.">
          <div className="text-sm opacity-80">ORDERS (∑)</div>
          <div className="text-2xl font-semibold">{ordersVal}</div>
        </div>
        <div className="border rounded p-4" title="Average Order Value = Sales / Orders (this range).">
          <div className="text-sm opacity-80">AOV (∑)</div>
          <div className="text-2xl font-semibold">{fmtUSD(aov)}</div>
        </div>
        <div className="border rounded p-4" title="Food cost percentage = Food expenses / Sales (this range).">
          <div className="text-sm opacity-80">FOOD %</div>
          <div className="text-2xl font-semibold">
            {(() => {
              const food = breakdown.find((x) => x.name?.toLowerCase() === "food")?.value ?? 0;
              return `${Math.round((food / Math.max(1, salesVal)) * 100)}%`;
            })()}
          </div>
        </div>
        <div className="border rounded p-4" title="Labor percentage = Labor expenses / Sales (this range).">
          <div className="text-sm opacity-80">LABOR %</div>
          <div className="text-2xl font-semibold">
            {(() => {
              const labor = breakdown.find((x) => x.name?.toLowerCase() === "labor")?.value ?? 0;
              return `${Math.round((labor / Math.max(1, salesVal)) * 100)}%`;
            })()}
          </div>
        </div>
        <div className="border rounded p-4" title="Prime cost = Food % + Labor %.">
          <div className="text-sm opacity-80">PRIME %</div>
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
        <div className="border rounded p-4">
          <div className="text-sm opacity-80 mb-2">
            Sales vs Expenses — {range === "today" ? "last 12 days" : range === "week" ? "last 12 weeks" : range === "ytd" ? "YTD (by month)" : "last 12 months"}
          </div>
          <SalesVsExpenses data={series} />
        </div>
        <div className="border rounded p-4">
          <div className="text-sm opacity-80 mb-2">Expense breakdown — current range</div>
          <ExpenseDonut data={breakdown} />
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <div className="border rounded p-4">
          <div className="text-sm opacity-80 mb-2">Weekday revenue (this month)</div>
          <WeekdayBars labels={weekday.labels} values={weekday.values} />
        </div>
        <div className="border rounded p-4">
          <div className="text-sm opacity-80 mb-2">Top items — current range</div>
          <TopItems data={topItems} />
        </div>
      </section>

      {/* bottom table */}
      <section className="mt-6 border rounded">
        <div className="px-4 py-3 border-b text-sm opacity-80">Last 4 months (quick look)</div>
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
                  <td className="px-2 py-1 text-right">{fmtUSD(r.aov)}</td>
                  <td className="px-2 py-1 text-right">{r.orders}</td>
                  <td className="px-2 py-1 text-right">{fmtUSD(r.sales)}</td>
                  <td className="px-2 py-1 text-right">{fmtUSD(r.expenses)}</td>
                  <td className={`px-2 py-1 text-right ${r.profit < 0 ? "text-rose-400" : ""}`}>{fmtUSD(r.profit)}</td>
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
