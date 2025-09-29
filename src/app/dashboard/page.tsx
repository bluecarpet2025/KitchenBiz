import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { SalesVsExpensesChart, ExpenseDonut, TopItemsChart } from "./charts";

/* ----------------- tiny utils ----------------- */
const fmtUSD = (n: number) =>
  (Number(n) || 0).toLocaleString(undefined, { style: "currency", currency: "USD" });
const pad = (n: number) => String(n).padStart(2, "0");
const todayISO = () => new Date().toISOString().slice(0, 10);
const monthISO = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
const yearISO = (d: Date) => String(d.getUTCFullYear());
const isoWeek = (d = new Date()) => {
  const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  dt.setUTCDate(dt.getUTCDate() + 4 - (dt.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((+dt - +yearStart) / 86400000 + 1) / 7);
  return `${dt.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
};

/* -------- server action: save goal (cookie) -------- */
async function setGoal(formData: FormData) {
  "use server";
  const v = Number(formData.get("goal"));
  const goal = Number.isFinite(v) && v >= 0 ? Math.round(v) : 10000;
  const c = await cookies();
  c.set("kb_goal", String(goal), { path: "/", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/dashboard");
}

/* ---- helpers (RLS scopes tenant; no tenant_id filters here) ---- */
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
  start: string,
  endExcl: string
): Promise<Array<{ name: string; value: number; label?: string }>> {
  const { data } = await supabase
    .from("expenses")
    .select("category, amount_usd, occurred_at, created_at")
  /* RLS handles tenant scoping */;

  const byCat = new Map<string, number>();
  for (const r of (data ?? []) as any[]) {
    const when = new Date(r.occurred_at ?? r.created_at ?? new Date());
    if (when >= new Date(start) && when < new Date(endExcl)) {
      const k = r.category ?? "Misc";
      byCat.set(k, (byCat.get(k) ?? 0) + Number(r.amount_usd ?? 0));
    }
  }
  const total = Array.from(byCat.values()).reduce((s, v) => s + v, 0);
  return Array.from(byCat.entries()).map(([name, value]) => ({
    name,
    value,
    label: `${name} — ${total > 0 ? Math.round((value / total) * 100) : 0}%`,
  }));
}

async function weekdayRevenueThisMonth(supabase: any) {
  const now = new Date();
  const mStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const mEndExcl = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const { data } = await supabase
    .from("sales_order_lines")
    .select("qty, unit_price, order:sales_orders(occurred_at, created_at)");
  const days = Array.from({ length: 7 }, (_, i) => ({ dow: i, total: 0 }));
  for (const r of (data ?? []) as any[]) {
    const od = new Date(
      r.order?.occurred_at ?? r.order?.created_at ?? r.created_at ?? new Date()
    );
    if (od >= mStart && od < mEndExcl) {
      const wd = od.getUTCDay();
      days[wd].total += Number(r.qty ?? 0) * Number(r.unit_price ?? 0);
    }
  }
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return days.map((d) => ({ name: names[d.dow], value: d.total }));
}

type L12 = { key: string; sales: number; expenses: number; profit: number };

async function seriesForRange(supabase: any, range: "today" | "week" | "month" | "ytd"): Promise<L12[]> {
  const out: L12[] = [];

  if (range === "today") {
    // last 12 days
    const base = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() - i));
      const key = d.toISOString().slice(0, 10);
      const [s, e] = await Promise.all([
        sumOne(supabase, "v_sales_day_totals", "day", key, "revenue"),
        sumOne(supabase, "v_expense_day_totals", "day", key, "total"),
      ]);
      out.push({ key, sales: s, expenses: e, profit: s - e });
    }
    return out;
  }

  if (range === "week") {
    // last 12 ISO weeks
    const weeklyKey = (d: Date) => {
      const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
      dt.setUTCDate(dt.getUTCDate() + 4 - (dt.getUTCDay() || 7));
      const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
      const weekNo = Math.ceil(((+dt - +yearStart) / 86400000 + 1) / 7);
      return `${dt.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
    };
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - i * 7);
      const key = weeklyKey(d);
      const [s, e] = await Promise.all([
        sumOne(supabase, "v_sales_week_totals", "week", key, "revenue"),
        sumOne(supabase, "v_expense_week_totals", "week", key, "total"),
      ]);
      out.push({ key, sales: s, expenses: e, profit: s - e });
    }
    return out;
  }

  if (range === "ytd") {
    const now = new Date();
    const y = now.getUTCFullYear();
    for (let m = 0; m <= now.getUTCMonth(); m++) {
      const key = `${y}-${pad(m + 1)}`;
      const [s, e] = await Promise.all([
        sumOne(supabase, "v_sales_month_totals", "month", key, "revenue"),
        sumOne(supabase, "v_expense_month_totals", "month", key, "total"),
      ]);
      out.push({ key, sales: s, expenses: e, profit: s - e });
    }
    return out;
  }

  // last 12 months (default)
  const base = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - i, 1));
    const key = monthISO(d);
    const [s, e] = await Promise.all([
      sumOne(supabase, "v_sales_month_totals", "month", key, "revenue"),
      sumOne(supabase, "v_expense_month_totals", "month", key, "total"),
    ]);
    out.push({ key, sales: s, expenses: e, profit: s - e });
  }
  return out;
}

async function topItemsInRange(supabase: any, start: string, endExcl: string) {
  const { data } = await supabase
    .from("sales_order_lines")
    .select("product_name, qty, unit_price, order:sales_orders(occurred_at, created_at)");
  const by = new Map<string, number>();
  for (const r of (data ?? []) as any[]) {
    const when = new Date(r.order?.occurred_at ?? r.order?.created_at ?? r.created_at ?? new Date());
    if (when >= new Date(start) && when < new Date(endExcl)) {
      const name = r.product_name ?? "Unknown";
      by.set(name, (by.get(name) ?? 0) + Number(r.qty ?? 0) * Number(r.unit_price ?? 0));
    }
  }
  return Array.from(by.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, value]) => ({ name, value }));
}

/* -------------------- PAGE -------------------- */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const range = (typeof sp.range === "string" ? sp.range : "month") as
    | "today"
    | "week"
    | "month"
    | "ytd";

  const cookieStore = await cookies();
  const savedGoal = Number(cookieStore.get("kb_goal")?.value ?? 10000) || 10000;

  const supabase = await createServerClient();

  // period keys
  const now = new Date();
  const thisDay = todayISO();
  const thisWeek = isoWeek();
  const thisMonth = monthISO(now);
  const thisYear = yearISO(now);

  // window [start, end)
  let start = "", endExcl = "";
  if (range === "today") {
    start = thisDay;
    endExcl = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
      .toISOString()
      .slice(0, 10);
  } else if (range === "week") {
    const dt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const wd = dt.getUTCDay() || 7;
    const mon = new Date(dt); mon.setUTCDate(dt.getUTCDate() - (wd - 1));
    const nextMon = new Date(mon); nextMon.setUTCDate(mon.getUTCDate() + 7);
    start = mon.toISOString().slice(0, 10);
    endExcl = nextMon.toISOString().slice(0, 10);
  } else if (range === "ytd") {
    start = `${thisYear}-01-01`;
    endExcl = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
      .toISOString()
      .slice(0, 10);
  } else {
    const mStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const mEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    start = mStart.toISOString().slice(0, 10);
    endExcl = mEnd.toISOString().slice(0, 10);
  }

  // headline
  const [salesThis, expensesThis] = await Promise.all([
    (async () => {
      if (range === "today") return sumOne(supabase, "v_sales_day_totals", "day", thisDay, "revenue");
      if (range === "week") return sumOne(supabase, "v_sales_week_totals", "week", thisWeek, "revenue");
      if (range === "ytd") return sumOne(supabase, "v_sales_year_totals", "year", thisYear, "revenue");
      return sumOne(supabase, "v_sales_month_totals", "month", thisMonth, "revenue");
    })(),
    (async () => {
      if (range === "today") return sumOne(supabase, "v_expense_day_totals", "day", thisDay, "total");
      if (range === "week") return sumOne(supabase, "v_expense_week_totals", "week", thisWeek, "total");
      if (range === "ytd") return sumOne(supabase, "v_expense_year_totals", "year", thisYear, "total");
      return sumOne(supabase, "v_expense_month_totals", "month", thisMonth, "total");
    })(),
  ]);
  const profitThis = salesThis - expensesThis;

  // AOV & orders (current month)
  const [ordersMonth, salesMonth] = await Promise.all([
    sumOne(supabase, "v_sales_month_totals", "month", thisMonth, "orders"),
    sumOne(supabase, "v_sales_month_totals", "month", thisMonth, "revenue"),
  ]);
  const aov = ordersMonth > 0 ? salesMonth / ordersMonth : 0;

  // expense %, prime
  const breakdown = await expenseBreakdown(supabase, start, endExcl);
  const totalExp = breakdown.reduce((s, x) => s + x.value, 0);
  const food = breakdown.find((x) => x.name?.toLowerCase() === "food")?.value ?? 0;
  const labor = breakdown.find((x) => x.name?.toLowerCase() === "labor")?.value ?? 0;
  const foodPct = totalExp > 0 ? Math.round((food / totalExp) * 100) : 0;
  const laborPct = totalExp > 0 ? Math.round((labor / totalExp) * 100) : 0;
  const primePct = Math.min(100, foodPct + laborPct);

  // charts
  const series = await seriesForRange(supabase, range);
  const weekdays = await weekdayRevenueThisMonth(supabase);
  const topItems = await topItemsInRange(supabase, start, endExcl);

  // last 4 rows
  const last4 = series.slice(-4);
  const rows = await Promise.all(
    last4.map(async (p) => {
      const label = p.key;
      const isMonth = /^\d{4}-\d{2}$/.test(label);
      const orders = isMonth ? await sumOne(supabase, "v_sales_month_totals", "month", label, "orders") : 0;
      const aovCell = orders > 0 ? p.sales / orders : 0;
      return { label, orders, aov: aovCell, sales: p.sales, expenses: p.expenses, profit: p.profit };
    })
  );

  const goal = savedGoal;
  const goalPct = Math.min(100, Math.round((salesThis / Math.max(1, goal)) * 100));

  return (
    <main className="max-w-6xl mx-auto px-4 py-6 space-y-4">
      {/* range toggles */}
      <div className="flex justify-end gap-2">
        {(["today", "week", "month", "ytd"] as const).map((r) => (
          <Link
            key={r}
            href={`/dashboard?range=${r}`}
            className={`px-3 py-1 border rounded text-sm ${range === r ? "bg-neutral-900" : "hover:bg-neutral-900"}`}
          >
            {r === "ytd" ? "YTD" : r[0].toUpperCase() + r.slice(1)}
          </Link>
        ))}
      </div>

      {/* top row */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card title={`${range.toUpperCase()} — SALES`} extra={null}>
          <div className="text-2xl font-semibold">{fmtUSD(salesThis)}</div>
        </Card>
        <Card title={`${range.toUpperCase()} — EXPENSES`} extra={null}>
          <div className="text-2xl font-semibold">{fmtUSD(expensesThis)}</div>
        </Card>
        <Card title={`${range.toUpperCase()} — PROFIT / LOSS`} extra={null}>
          <div className={`text-2xl font-semibold ${profitThis < 0 ? "text-rose-400" : ""}`}>{fmtUSD(profitThis)}</div>
        </Card>
        <Card
          title="SALES vs GOAL"
          extra={
            <form action={setGoal} className="flex items-center gap-2">
              <input name="goal" inputMode="numeric" className="w-20 px-2 py-1 bg-black/20 border rounded text-sm" defaultValue={goal} />
              <button type="submit" className="px-2 py-1 border rounded text-sm hover:bg-neutral-900">Save</button>
            </form>
          }
        >
          <div className="text-xl font-semibold">{fmtUSD(salesThis)}</div>
          <div className="text-xs opacity-70">Goal {fmtUSD(goal)}</div>
          <div className="mt-2 h-2 rounded bg-neutral-800">
            <div className="h-2 rounded bg-pink-500" style={{ width: `${goalPct}%` }} />
          </div>
          <div className="text-xs opacity-70 mt-1">{goalPct}%</div>
        </Card>
      </section>

      {/* mid KPIs */}
      <section className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Mini title="ORDERS (M)"><span className="text-xl font-semibold">{ordersMonth}</span></Mini>
        <Mini title="AOV (M)"><span className="text-xl font-semibold">{fmtUSD(aov)}</span></Mini>
        <Mini title={<>FOOD % <span title="Food cost as % of expenses in selected range">ⓘ</span></>}>
          <span className="text-xl font-semibold">{foodPct}%</span>
        </Mini>
        <Mini title={<>LABOR % <span title="Labor cost as % of expenses in selected range">ⓘ</span></>}>
          <span className="text-xl font-semibold">{laborPct}%</span>
        </Mini>
        <Mini title={<>PRIME % <span title="Food% + Labor%">ⓘ</span></>}>
          <span className="text-xl font-semibold">{primePct}%</span>
        </Mini>
      </section>

      {/* charts */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SalesVsExpensesChart data={series} range={range} />
        <ExpenseDonut data={breakdown} />
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title="Weekday revenue (this month)" extra={null}>
          <ul className="space-y-2">
            {weekdays.map((w) => (
              <li key={w.name} className="flex items-center gap-3">
                <div className="w-10 text-xs opacity-75">{w.name}</div>
                <div className="flex-1 h-2 bg-neutral-800 rounded">
                  <div
                    className="h-2 bg-neutral-300 rounded"
                    style={{
                      width: `${Math.min(
                        100,
                        (w.value / Math.max(1, Math.max(...weekdays.map((x) => x.value)))) * 100
                      )}%`,
                    }}
                  />
                </div>
                <div className="w-24 text-right text-xs">{fmtUSD(w.value)}</div>
              </li>
            ))}
          </ul>
        </Card>
        <TopItemsChart data={topItems.length ? topItems : [{ name: "No items in this range.", value: 0 }]} />
      </section>

      {/* bottom table */}
      <section className="mt-4">
        <div className="border rounded overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="opacity-80 bg-black/20">
              <tr>
                <th className="text-left font-normal px-3 py-2">Period</th>
                <th className="text-right font-normal px-3 py-2">Sales</th>
                <th className="text-right font-normal px-3 py-2">Orders</th>
                <th className="text-right font-normal px-3 py-2">AOV</th>
                <th className="text-right font-normal px-3 py-2">Expenses</th>
                <th className="text-right font-normal px-3 py-2">Profit</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className="border-t">
                  <td className="px-3 py-2">{r.label}</td>
                  <td className="px-3 py-2 text-right">{fmtUSD(r.sales)}</td>
                  <td className="px-3 py-2 text-right">{r.orders}</td>
                  <td className="px-3 py-2 text-right">{fmtUSD(r.aov)}</td>
                  <td className="px-3 py-2 text-right">{fmtUSD(r.expenses)}</td>
                  <td className={`px-3 py-2 text-right ${r.profit < 0 ? "text-rose-400" : ""}`}>{fmtUSD(r.profit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex gap-2 mt-3">
          <Link href="/sales" className="rounded border px-3 py-1 hover:bg-neutral-900 text-sm">Sales details</Link>
          <Link href="/expenses" className="rounded border px-3 py-1 hover:bg-neutral-900 text-sm">Expenses details</Link>
        </div>
      </section>
    </main>
  );
}

/* ---- simple card shells ---- */
function Card({ title, extra, children }: { title: React.ReactNode; extra: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="border rounded p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs opacity-75">{title}</div>
        <div className="text-xs">{extra}</div>
      </div>
      {children}
    </div>
  );
}
function Mini({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="border rounded p-4">
      <div className="text-xs opacity-75">{title}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}
