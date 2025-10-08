import { cookies } from "next/headers";
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { money } from "@/lib/format";

// ⬇️ import client chart components directly (charts.tsx has "use client")
import {
  SalesVsExpensesChart,
  ExpenseDonut,
  TopItemsChart,
  WeekdayBars,
} from "./charts";

// Small server-safe date helpers
const pad = (n: number) => String(n).padStart(2, "0");
const todayStr = (d = new Date()) =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const monthStr = (d = new Date()) =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
const yearStr = (d = new Date()) => String(d.getUTCFullYear());
const weekKey = (d = new Date()) => {
  const dt = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  );
  dt.setUTCDate(dt.getUTCDate() + 4 - (dt.getUTCDay() || 7)); // ISO Thu
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  const w = Math.ceil(((+dt - +yearStart) / 86400000 + 1) / 7);
  return `${dt.getUTCFullYear()}-W${pad(w)}`;
};

// ----- database helpers (respect RLS via get_effective_tenant) -----
async function getTenantId(supabase: any): Promise<string | null> {
  // Prefer your RPC if available (already created earlier)
  const { data, error } = await supabase.rpc("get_effective_tenant");
  if (!error && data) return data as string;
  // Fallback: profile row
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: prof } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .maybeSingle();
  return (prof?.tenant_id as string | null) ?? null;
}

type Period = "today" | "week" | "month" | "ytd";

function coerceRange(input?: string): Period {
  if (input === "today" || input === "week" || input === "ytd") return input;
  return "month";
}

async function sumOne(
  supabase: any,
  view: string,
  periodField: "day" | "week" | "month" | "year",
  key: string,
  tenantId: string,
  col: "revenue" | "total" | "orders"
): Promise<number> {
  const { data, error } = await supabase
    .from(view)
    .select(col)
    .eq("tenant_id", tenantId)
    .eq(periodField, key)
    .maybeSingle();
  if (error) return 0;
  const raw = (data as any)?.[col];
  return typeof raw === "number" ? raw : Number(raw ?? 0);
}

async function expenseBreakdown(
  supabase: any,
  tenantId: string,
  startIso: string,
  endIso: string
): Promise<Array<{ name: string; value: number; label: string }>> {
  // Uses raw table `expenses` so it works for any range
  const { data, error } = await supabase
    .from("expenses")
    .select("category, amount_usd, occurred_at")
    .eq("tenant_id", tenantId)
    .gte("occurred_at", `${startIso}T00:00:00Z`)
    .lt("occurred_at", `${endIso}T00:00:00Z`);
  if (error || !data) return [];
  const map = new Map<string, number>();
  for (const r of data as any[]) {
    const k = r.category ?? "Misc";
    map.set(k, (map.get(k) ?? 0) + Number(r.amount_usd ?? 0));
  }
  const total = Array.from(map.values()).reduce((a, b) => a + b, 0);
  return Array.from(map.entries()).map(([name, v]) => ({
    name,
    value: v,
    label: total > 0 ? `${money(v)} (${Math.round((v / total) * 100)}%)` : money(v),
  }));
}

async function weekdayRevenueThisMonth(supabase: any, tenantId: string) {
  // 0..6 = Sun..Sat in our UI
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const { data, error } = await supabase
    .from("sales_orders")
    .select("occurred_at, created_at, id")
    .eq("tenant_id", tenantId)
    .gte("coalesce(occurred_at, created_at)", start.toISOString())
    .lt("coalesce(occurred_at, created_at)", end.toISOString());
  if (error || !data) return Array(7).fill(0);
  const sums = Array(7).fill(0) as number[];
  // Join order lines to compute revenue
  const ids = (data as any[]).map((r) => r.id);
  if (ids.length === 0) return sums;
  const { data: lines } = await supabase
    .from("sales_order_lines")
    .select("order_id, qty, unit_price");
  const byId = new Map<string, number>();
  for (const line of (lines ?? []) as any[]) {
    const rev = Number(line.qty ?? 0) * Number(line.unit_price ?? 0);
    byId.set(line.order_id, (byId.get(line.order_id) ?? 0) + rev);
  }
  for (const o of data as any[]) {
    const ts = new Date(o.occurred_at ?? o.created_at);
    const dow = ts.getUTCDay(); // 0..6
    sums[dow] += byId.get(o.id) ?? 0;
  }
  return sums;
}

async function topItemsForRange(
  supabase: any,
  tenantId: string,
  startIso: string,
  endIso: string
): Promise<Array<{ name: string; value: number }>> {
  // Aggregate by product_name (your seed named this column)
  const { data, error } = await supabase
    .from("sales_orders")
    .select("id, occurred_at, created_at")
    .eq("tenant_id", tenantId)
    .gte("coalesce(occurred_at, created_at)", `${startIso}T00:00:00Z`)
    .lt("coalesce(occurred_at, created_at)", `${endIso}T00:00:00Z`);
  if (error || !data) return [];
  const ids = (data as any[]).map((r) => r.id);
  if (ids.length === 0) return [];
  const { data: lines } = await supabase
    .from("sales_order_lines")
    .select("order_id, product_name, qty, unit_price");
  const map = new Map<string, number>();
  for (const l of (lines ?? []) as any[]) {
    if (!ids.includes(l.order_id)) continue;
    const k = (l.product_name ?? "Item").toString();
    map.set(k, (map.get(k) ?? 0) + Number(l.qty ?? 0) * Number(l.unit_price ?? 0));
  }
  // Top 5
  return Array.from(map.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);
}

// Compute period window
function periodWindow(range: Period, now = new Date()) {
  if (range === "today") {
    const s = todayStr(now);
    const e = todayStr(
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
    );
    return { label: "day", key: s, startIso: s, endIso: e };
  }
  if (range === "week") {
    // ISO week: we still query by day window
    const start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    );
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() || 7) - 1)); // Monday
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 7);
    return { label: "week", key: weekKey(now), startIso: todayStr(start), endIso: todayStr(end) };
  }
  if (range === "ytd") {
    const y = now.getUTCFullYear();
    return { label: "year", key: String(y), startIso: `${y}-01-01`, endIso: `${y + 1}-01-01` };
  }
  // month
  const m = monthStr(now);
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { label: "month", key: m, startIso: todayStr(start), endIso: todayStr(end) };
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: { [k: string]: string | string[] | undefined };
}) {
  const supabase = await createServerClient(await cookies());
  const tenantId = await getTenantId(supabase);
  const range = coerceRange(
    typeof searchParams?.range === "string"
      ? searchParams?.range
      : Array.isArray(searchParams?.range)
      ? searchParams?.range[0]
      : undefined
  );

  if (!tenantId) {
    return (
      <main className="max-w-6xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-semibold mb-4">Dashboard</h1>
        <p className="opacity-80">No tenant selected.</p>
      </main>
    );
  }

  const win = periodWindow(range);

  // SALES / ORDERS (views)
  const [sales, orders] =
    range === "today"
      ? await Promise.all([
          sumOne(supabase, "v_sales_day_totals", "day", win.key, tenantId, "revenue"),
          sumOne(supabase, "v_sales_day_totals", "day", win.key, tenantId, "orders"),
        ])
      : range === "week"
      ? await Promise.all([
          sumOne(supabase, "v_sales_week_totals", "week", win.key, tenantId, "revenue"),
          sumOne(supabase, "v_sales_week_totals", "week", win.key, tenantId, "orders"),
        ])
      : range === "ytd"
      ? await Promise.all([
          sumOne(supabase, "v_sales_year_totals", "year", win.key, tenantId, "revenue"),
          sumOne(supabase, "v_sales_year_totals", "year", win.key, tenantId, "orders"),
        ])
      : await Promise.all([
          sumOne(supabase, "v_sales_month_totals", "month", win.key, tenantId, "revenue"),
          sumOne(supabase, "v_sales_month_totals", "month", win.key, tenantId, "orders"),
        ]);

  // EXPENSES (views)
  const expenses =
    range === "today"
      ? await sumOne(supabase, "v_expense_day_totals", "day", win.key, tenantId, "total")
      : range === "week"
      ? await sumOne(supabase, "v_expense_week_totals", "week", win.key, tenantId, "total")
      : range === "ytd"
      ? await sumOne(supabase, "v_expense_year_totals", "year", win.key, tenantId, "total")
      : await sumOne(supabase, "v_expense_month_totals", "month", win.key, tenantId, "total");

  const profit = sales - expenses;
  const aov = orders > 0 ? sales / orders : 0;

  // MoM deltas for the 3 KPIs when on "month"
  let deltaSales = 0,
    deltaExp = 0,
    deltaProfit = 0;
  if (range === "month") {
    const now = new Date();
    const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const prevKey = monthStr(prev);
    const [sPrev, ePrev] = await Promise.all([
      sumOne(supabase, "v_sales_month_totals", "month", prevKey, tenantId, "revenue"),
      sumOne(supabase, "v_expense_month_totals", "month", prevKey, tenantId, "total"),
    ]);
    const pPrev = sPrev - ePrev;
    deltaSales = sPrev ? ((sales - sPrev) / sPrev) * 100 : 0;
    deltaExp = ePrev ? ((expenses - ePrev) / ePrev) * 100 : 0;
    deltaProfit = pPrev ? ((profit - pPrev) / pPrev) * 100 : 0;
  }

  // For graphs: last 12 (months|weeks|days)
  const seriesLimit = 12;
  let series: Array<{ key: string; sales: number; expenses: number; profit: number }> = [];
  if (range === "month" || range === "ytd") {
    // last 12 months
    const base = new Date();
    for (let i = seriesLimit - 1; i >= 0; i--) {
      const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - i, 1));
      const k = monthStr(d);
      const [s, e] = await Promise.all([
        sumOne(supabase, "v_sales_month_totals", "month", k, tenantId, "revenue"),
        sumOne(supabase, "v_expense_month_totals", "month", k, tenantId, "total"),
      ]);
      series.push({ key: k, sales: s, expenses: e, profit: s - e });
    }
  } else if (range === "week") {
    // last 12 weeks (labels = ISO IYYY-Www)
    const base = new Date();
    for (let i = seriesLimit - 1; i >= 0; i--) {
      const d = new Date(
        Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() - i * 7)
      );
      const k = weekKey(d);
      const [s, e] = await Promise.all([
        sumOne(supabase, "v_sales_week_totals", "week", k, tenantId, "revenue"),
        sumOne(supabase, "v_expense_week_totals", "week", k, tenantId, "total"),
      ]);
      series.push({ key: k, sales: s, expenses: e, profit: s - e });
    }
  } else {
    // today: last 12 days
    const base = new Date();
    for (let i = seriesLimit - 1; i >= 0; i--) {
      const d = new Date(
        Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() - i)
      );
      const k = todayStr(d);
      const [s, e] = await Promise.all([
        sumOne(supabase, "v_sales_day_totals", "day", k, tenantId, "revenue"),
        sumOne(supabase, "v_expense_day_totals", "day", k, tenantId, "total"),
      ]);
      series.push({ key: k, sales: s, expenses: e, profit: s - e });
    }
  }

  const breakdown = await expenseBreakdown(supabase, tenantId, win.startIso, win.endIso);
  const weekdays = await weekdayRevenueThisMonth(supabase, tenantId);
  const topItems = await topItemsForRange(supabase, tenantId, win.startIso, win.endIso);

  // Goal cookie
  const c = await cookies();
  const goalCookie = c.get("kb_goal")?.value;
  const goal = Number.isFinite(Number(goalCookie)) ? Number(goalCookie) : 10000;

  return (
    <main className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <div className="flex gap-2">
          <Link
            href="/dashboard?range=today"
            className={`px-2 py-1 border rounded ${range === "today" ? "bg-neutral-900" : ""}`}
          >
            Today
          </Link>
          <Link
            href="/dashboard?range=week"
            className={`px-2 py-1 border rounded ${range === "week" ? "bg-neutral-900" : ""}`}
          >
            Week
          </Link>
          <Link
            href="/dashboard?range=month"
            className={`px-2 py-1 border rounded ${range === "month" ? "bg-neutral-900" : ""}`}
          >
            Month
          </Link>
          <Link
            href="/dashboard?range=ytd"
            className={`px-2 py-1 border rounded ${range === "ytd" ? "bg-neutral-900" : ""}`}
          >
            YTD
          </Link>
        </div>
      </div>

      {/* KPI row */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="border rounded p-4">
          <div className="text-xs opacity-70">MONTH — SALES</div>
          <div className="text-2xl font-semibold">{money(sales)}</div>
          {range === "month" && (
            <div className="text-emerald-400 text-xs mt-1">
              {deltaSales >= 0 ? "+" : ""}
              {deltaSales.toFixed(1)}% MoM
            </div>
          )}
        </div>
        <div className="border rounded p-4">
          <div className="text-xs opacity-70">MONTH — EXPENSES</div>
          <div className="text-2xl font-semibold">{money(expenses)}</div>
          {range === "month" && (
            <div className="text-emerald-400 text-xs mt-1">
              {deltaExp >= 0 ? "+" : ""}
              {deltaExp.toFixed(1)}% MoM
            </div>
          )}
        </div>
        <div className="border rounded p-4">
          <div className="text-xs opacity-70">MONTH — PROFIT / LOSS</div>
          <div className={`text-2xl font-semibold ${profit < 0 ? "text-rose-400" : ""}`}>
            {money(profit)}
          </div>
          {range === "month" && (
            <div className="text-emerald-400 text-xs mt-1">
              {deltaProfit >= 0 ? "+" : ""}
              {deltaProfit.toFixed(1)}% MoM
            </div>
          )}
        </div>
        <form action="/api/set-goal" method="post" className="border rounded p-4">
          <div className="text-xs opacity-70">SALES vs GOAL</div>
          <div className="text-2xl font-semibold">{money(sales)}</div>
          <div className="text-xs opacity-70 mt-1">Goal {money(goal)}</div>
          <div className="h-1 bg-neutral-800 rounded mt-2">
            <div
              className="h-1 bg-pink-500 rounded"
              style={{ width: `${Math.min(100, (sales / (goal || 1)) * 100)}%` }}
            />
          </div>
          <div className="flex gap-2 mt-2">
            <input name="goal" defaultValue={goal} className="w-24 px-2 py-1 rounded bg-black border" />
            <button className="px-3 py-1 border rounded">Save</button>
          </div>
        </form>
      </section>

      {/* KPI mini row with tooltips */}
      <section className="grid grid-cols-1 md:grid-cols-5 gap-4 mt-4">
        <div className="border rounded p-4" title="Orders (M): number of sales orders in the selected period.">
          <div className="text-xs opacity-70">ORDERS (M)</div>
          <div className="text-xl font-semibold">{orders}</div>
        </div>
        <div className="border rounded p-4" title="AOV (M): Average Order Value = Sales / Orders for the selected period.">
          <div className="text-xs opacity-70">AOV (M)</div>
          <div className="text-xl font-semibold">{money(aov)}</div>
        </div>
        <div className="border rounded p-4" title="Food %: food costs / sales in the selected period (from expenses tagged Food).">
          <div className="text-xs opacity-70">FOOD %</div>
          <div className="text-xl font-semibold">
            {(() => {
              const food = breakdown.find((b) => b.name.toLowerCase() === "food")?.value ?? 0;
              return `${Math.round((food / (sales || 1)) * 100)}%`;
            })()}
          </div>
        </div>
        <div className="border rounded p-4" title="Labor %: labor costs / sales in the selected period (from expenses tagged Labor).">
          <div className="text-xs opacity-70">LABOR %</div>
          <div className="text-xl font-semibold">
            {(() => {
              const labor = breakdown.find((b) => b.name.toLowerCase() === "labor")?.value ?? 0;
              return `${Math.round((labor / (sales || 1)) * 100)}%`;
            })()}
          </div>
        </div>
        <div className="border rounded p-4" title="Prime %: Food + Labor as % of Sales.">
          <div className="text-xs opacity-70">PRIME %</div>
          <div className="text-xl font-semibold">
            {(() => {
              const food = breakdown.find((b) => b.name.toLowerCase() === "food")?.value ?? 0;
              const labor = breakdown.find((b) => b.name.toLowerCase() === "labor")?.value ?? 0;
              return `${Math.round(((food + labor) / (sales || 1)) * 100)}%`;
            })()}
          </div>
        </div>
      </section>

      {/* Charts */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        {/* Sales vs Expenses */}
        <div className="border rounded p-3">
          <div className="text-sm opacity-70 mb-2">
            Sales vs Expenses — last 12 {range === "today" ? "days" : range === "week" ? "weeks" : "months"}
          </div>
          <SalesVsExpensesChart data={series} />
        </div>
        {/* Expense donut */}
        <div className="border rounded p-3">
          <div className="text-sm opacity-70 mb-2">Expense breakdown — current range</div>
          <ExpenseDonut data={breakdown} />
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        {/* Weekday revenue */}
        <div className="border rounded p-3">
          <div className="text-sm opacity-70 mb-2">Weekday revenue (this month)</div>
          <WeekdayBars data={weekdays} />
        </div>

        {/* Top items */}
        <div className="border rounded p-3">
          <div className="text-sm opacity-70 mb-2">Top items — current range</div>
          <TopItemsChart data={topItems} />
        </div>
      </section>

      {/* Last 4 months table */}
      <section className="border rounded mt-4">
        <div className="px-4 py-3 border-b text-sm opacity-80">Last 4 months (quick look)</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="opacity-80">
              <tr className="border-b">
                <th className="text-left font-normal px-4 py-2">Period</th>
                <th className="text-right font-normal px-4 py-2">AOV</th>
                <th className="text-right font-normal px-4 py-2">Orders</th>
                <th className="text-right font-normal px-4 py-2">Sales</th>
                <th className="text-right font-normal px-4 py-2">Expenses</th>
                <th className="text-right font-normal px-4 py-2">Profit</th>
              </tr>
            </thead>
            <tbody>
             {series.slice(-4).map((r) => {
  const p = r.sales - r.expenses;
  // ❌ old (bad): used money() inside math, returns string
  // const o = r.sales > 0 ? Math.round(r.sales / (money(1) && (aov || 1))) : 0;
  // const a = o > 0 ? r.sales / o : 0;

  // ✅ new (good): use the numeric AOV we already have for the current view
  const o = aov > 0 ? Math.round(r.sales / aov) : 0;
  const a = o > 0 ? r.sales / o : 0;

  return (
    <tr key={r.key} className="border-t">
      <td className="px-4 py-2">{r.key}</td>
      <td className="px-4 py-2 text-right">{money(a)}</td>
      <td className="px-4 py-2 text-right">{o}</td>
      <td className="px-4 py-2 text-right">{money(r.sales)}</td>
      <td className="px-4 py-2 text-right">{money(r.expenses)}</td>
      <td className={`px-4 py-2 text-right ${p < 0 ? "text-rose-400" : ""}`}>{money(p)}</td>
    </tr>
  );
})}

            </tbody>
          </table>
        </div>
        <div className="flex gap-2 px-4 py-3">
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
