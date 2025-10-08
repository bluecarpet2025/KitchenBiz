/* eslint-disable @next/next/no-img-element */
import { cookies, headers } from "next/headers";
import Link from "next/link";

/**
 * NOTE on typing: do NOT import PageProps from "next".
 * We accept a plain object with optional searchParams to avoid the Vercel build error.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: { [k: string]: string | string[] | undefined };
}) {
  /* -------------- tiny server-safe utils -------------- */
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const money = (n: number) =>
    (Number(n) || 0).toLocaleString(undefined, { style: "currency", currency: "USD" });

  const todayStr = (d: Date = now) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const monthStr = (d: Date = now) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
  const yearStr  = (d: Date = now) => String(d.getUTCFullYear());
  const isoWeekStr = (d: Date = now) => {
    const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    dt.setUTCDate(dt.getUTCDate() + 4 - (dt.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(((+dt - +yearStart) / 86400000 + 1) / 7);
    return `${dt.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
  };
  const startOfMonth = (d = now) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const startOfNextMonth = (d = now) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  const startOfWeek = (d = now) => {
    const c = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const wd = c.getUTCDay() || 7; // Mon=1..Sun=7 for ISO feel
    c.setUTCDate(c.getUTCDate() - (wd - 1));
    return c;
  };
  const addDays = (d: Date, n: number) => {
    const c = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    c.setUTCDate(c.getUTCDate() + n);
    return c;
  };

  /* ---------------- supabase server client ---------------- */
  // Local minimal client (we avoid importing any client-only functions)
  const { createServerClient } = await import("@/lib/supabase/server");
  const supabase = await createServerClient();

  // which tenant? (respect demo toggle via SQL helper if you have it)
  let tenantId: string | null = null;
  {
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes?.user ?? null;

    if (user) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("tenant_id, use_demo")
        .eq("id", user.id)
        .maybeSingle();

      // Try your DB helper if present (otherwise fall back to profile.tenant_id)
      try {
        const { data: eff } = await supabase.rpc("get_effective_tenant");
        tenantId = (eff as string) ?? (prof?.tenant_id as string | null) ?? null;
      } catch {
        tenantId = (prof?.tenant_id as string | null) ?? null;
      }
    }
  }

  if (!tenantId) {
    // anonymous users get nothing here—render a gentle empty state
    return (
      <main className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-semibold mb-4">Dashboard</h1>
        <div className="border rounded p-6">
          <p className="opacity-80">
            You’re not signed in or don’t have a tenant yet.{" "}
            <Link className="underline" href="/login">Sign in</Link> or{" "}
            <Link className="underline" href="/profile">create a tenant</Link>.
          </p>
        </div>
      </main>
    );
  }

  /* ---------------- read range + goal ---------------- */
  const qp = typeof searchParams === "object" ? searchParams : {};
  const range = (typeof qp.range === "string" ? qp.range : "month") as "today" | "week" | "month" | "ytd";

  const cookieStore = await cookies();
  const goalCookie = cookieStore.get("kb_goal")?.value;
  const salesGoal = Math.max(0, Number(goalCookie ?? 10000) || 10000);

  /* ---------------- helpers that talk to views ---------------- */
  type AmountCol = "revenue" | "total";
  type PeriodField = "day" | "week" | "month" | "year";

  async function sumOne(
    view: string,
    periodField: PeriodField,
    key: string,
    column: AmountCol | "orders",
  ): Promise<number> {
    const { data, error } = await supabase
      .from(view)
      .select(column)
      .eq("tenant_id", tenantId)
      .eq(periodField, key)
      .maybeSingle();
    if (error) return 0;
    const v = (data as any)?.[column];
    return typeof v === "number" ? v : Number(v ?? 0);
  }

  async function series12(
    grain: "day" | "week" | "month",
    until: Date,
  ): Promise<
    Array<{ key: string; sales: number; expenses: number; profit: number; orders: number }>
  > {
    const out: Array<{ key: string; sales: number; expenses: number; profit: number; orders: number }> = [];
    const count = 12;

    for (let i = count - 1; i >= 0; i--) {
      let k = "";
      let when = new Date(Date.UTC(until.getUTCFullYear(), until.getUTCMonth(), until.getUTCDate()));
      if (grain === "day") {
        when = addDays(until, -i);
        k = todayStr(when);
      } else if (grain === "week") {
        const wstart = addDays(startOfWeek(until), -7 * i);
        k = isoWeekStr(wstart);
      } else {
        when = new Date(Date.UTC(until.getUTCFullYear(), until.getUTCMonth() - i, 1));
        k = monthStr(when);
      }
      const [s, e, o] = await Promise.all([
        sumOne(
          grain === "day" ? "v_sales_day_totals" : grain === "week" ? "v_sales_week_totals" : "v_sales_month_totals",
          grain,
          k,
          "revenue",
        ),
        sumOne(
          grain === "day" ? "v_expense_day_totals" : grain === "week" ? "v_expense_week_totals" : "v_expense_month_totals",
          grain,
          k,
          "total",
        ),
        sumOne(
          grain === "day" ? "v_sales_day_totals" : grain === "week" ? "v_sales_week_totals" : "v_sales_month_totals",
          grain,
          k,
          "orders",
        ),
      ]);
      out.push({ key: k, sales: s, expenses: e, profit: s - e, orders: o });
    }
    return out;
  }

  /* ---------------- range keys ---------------- */
  const dayKey   = todayStr(now);
  const weekKey  = isoWeekStr(now);
  const monthKey = monthStr(now);
  const yearKey  = yearStr(now);

  /* ---------------- headline metrics ---------------- */
  // sales/expenses/profit for selected range
  const [salesThis, expensesThis, ordersThis] = await (async () => {
    if (range === "today") {
      const [s, e, o] = await Promise.all([
        sumOne("v_sales_day_totals", "day", dayKey, "revenue"),
        sumOne("v_expense_day_totals", "day", dayKey, "total"),
        sumOne("v_sales_day_totals", "day", dayKey, "orders"),
      ]);
      return [s, e, o] as const;
    } else if (range === "week") {
      const [s, e, o] = await Promise.all([
        sumOne("v_sales_week_totals", "week", weekKey, "revenue"),
        sumOne("v_expense_week_totals", "week", weekKey, "total"),
        sumOne("v_sales_week_totals", "week", weekKey, "orders"),
      ]);
      return [s, e, o] as const;
    } else if (range === "ytd") {
      const [s, e, o] = await Promise.all([
        sumOne("v_sales_year_totals", "year", yearKey, "revenue"),
        sumOne("v_expense_year_totals", "year", yearKey, "total"),
        sumOne("v_sales_year_totals", "year", yearKey, "orders"),
      ]);
      return [s, e, o] as const;
    } else {
      const [s, e, o] = await Promise.all([
        sumOne("v_sales_month_totals", "month", monthKey, "revenue"),
        sumOne("v_expense_month_totals", "month", monthKey, "total"),
        sumOne("v_sales_month_totals", "month", monthKey, "orders"),
      ]);
      return [s, e, o] as const;
    }
  })();

  const profitThis = salesThis - expensesThis;
  const aovThis = ordersThis > 0 ? salesThis / ordersThis : 0;

  // MoM deltas (only for Month metric cards)
  const prevMonthKey = monthStr(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)));
  const [salesPrevMonth, expensesPrevMonth] = await Promise.all([
    sumOne("v_sales_month_totals", "month", prevMonthKey, "revenue"),
    sumOne("v_expense_month_totals", "month", prevMonthKey, "total"),
  ]);
  const profitPrevMonth = salesPrevMonth - expensesPrevMonth;
  const pct = (cur: number, prev: number) => (prev <= 0 ? 0 : ((cur - prev) / prev) * 100);

  /* ---------------- weekday revenue for current month ---------------- */
  const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const weekdayValues = await (async () => {
    const start = startOfMonth(now);
    const endEx = startOfNextMonth(now);
    const { data, error } = await supabase
      .from("v_sales_day_totals")
      .select("day, revenue")
      .eq("tenant_id", tenantId)
      .gte("day", todayStr(start))
      .lt("day", todayStr(endEx))
      .order("day", { ascending: true });
    if (error || !data) return weekdayLabels.map(() => 0);
    const buckets = Array(7).fill(0) as number[];
    for (const r of data as any[]) {
      const d = new Date(r.day + "T00:00:00Z");
      const wd = d.getUTCDay(); // 0..6
      buckets[wd] += Number(r.revenue || 0);
    }
    return buckets;
  })();

  /* ---------------- expense breakdown for current range ---------------- */
  async function expenseWindowTotals() {
    let startISO = "";
    let endISO = "";
    if (range === "today") {
      startISO = todayStr(now);
      endISO = todayStr(addDays(now, 1));
    } else if (range === "week") {
      const s = startOfWeek(now);
      startISO = todayStr(s);
      endISO = todayStr(addDays(s, 7));
    } else if (range === "ytd") {
      startISO = `${now.getUTCFullYear()}-01-01`;
      endISO = todayStr(addDays(now, 1));
    } else {
      startISO = todayStr(startOfMonth(now));
      endISO = todayStr(startOfNextMonth(now));
    }
    const { data, error } = await supabase
      .from("expenses")
      .select("category, amount_usd, occurred_at, tenant_id")
      .eq("tenant_id", tenantId)
      .gte("occurred_at", startISO)
      .lt("occurred_at", endISO);

    if (error || !data) return [] as Array<{ name: string; value: number }>;
    const map = new Map<string, number>();
    for (const r of data as any[]) {
      const k = (r.category as string) || "Misc";
      const v = Number(r.amount_usd || 0);
      map.set(k, (map.get(k) || 0) + v);
    }
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }

  const expenseBreakdown = await expenseWindowTotals();

  /* ---------------- top items (current range) ---------------- */
  async function topItemsCurrentRange() {
    let startISO = "";
    let endISO = "";
    if (range === "today") {
      startISO = todayStr(now);
      endISO = todayStr(addDays(now, 1));
    } else if (range === "week") {
      const s = startOfWeek(now);
      startISO = todayStr(s);
      endISO = todayStr(addDays(s, 7));
    } else if (range === "ytd") {
      startISO = `${now.getUTCFullYear()}-01-01`;
      endISO = todayStr(addDays(now, 1));
    } else {
      startISO = todayStr(startOfMonth(now));
      endISO = todayStr(startOfNextMonth(now));
    }

    // Join order lines -> orders via foreign key with RLS
    // We select product_name, qty, unit_price and filter by orders window + tenant.
    const { data, error } = await supabase
      .from("sales_order_lines")
      .select(`
        product_name,
        qty,
        unit_price,
        sales_orders!inner(tenant_id, occurred_at, created_at)
      `)
      .eq("sales_orders.tenant_id", tenantId)
      .gte("sales_orders.occurred_at", startISO)
      .lt("sales_orders.occurred_at", endISO);

    if (error || !data) return [] as Array<{ name: string; value: number }>;
    const m = new Map<string, number>();
    for (const row of data as any[]) {
      const name = (row.product_name as string) ?? "Unknown";
      const qty = Number(row.qty || 0);
      const price = Number(row.unit_price || 0);
      m.set(name, (m.get(name) || 0) + qty * price);
    }
    const arr = Array.from(m.entries()).map(([name, value]) => ({ name, value }));
    arr.sort((a, b) => b.value - a.value);
    return arr.slice(0, 5);
  }

  const topItems = await topItemsCurrentRange();

  /* ---------------- series for the big line chart + bottom table ---------------- */
  const series =
    range === "today"
      ? await series12("day", now)
      : range === "week"
      ? await series12("week", now)
      : await series12("month", now); // month & ytd display by month (the YTD label appears in title)

  /* ---------------- server action for goal ---------------- */
  async function setGoal(formData: FormData) {
    "use server";
    const v = Number(formData.get("goal") ?? 0);
    const val = Math.max(0, Math.round(isFinite(v) ? v : 0));
    const c = await cookies();
    c.set("kb_goal", String(val), { path: "/", maxAge: 60 * 60 * 24 * 365 });
    // simple redirect-less revalidation
    const { revalidatePath } = await import("next/cache");
    revalidatePath("/dashboard");
  }

  /* ---------------- computed helper metrics for small KPIs ---------------- */
  // simple heuristic targets (show as %) from expenses category mix
  const totalFood = expenseBreakdown.find((x) => x.name.toLowerCase().includes("food"))?.value ?? 0;
  const totalLabor = expenseBreakdown.find((x) => x.name.toLowerCase().includes("labor"))?.value ?? 0;
  const foodPct = salesThis > 0 ? (totalFood / salesThis) * 100 : 0;
  const laborPct = salesThis > 0 ? (totalLabor / salesThis) * 100 : 0;
  const primePct = foodPct + laborPct;

  /* ---------------- import client charts as islands ---------------- */
  const { SalesVsExpensesChart, ExpenseDonut, TopItemsChart, WeekdayBars } = await import("./charts");

  /* ---------------- render ---------------- */
  const activeBtn =
    "px-3 py-1 rounded border border-neutral-700 bg-neutral-900 text-xs";
  const quietBtn =
    "px-3 py-1 rounded border border-neutral-800 hover:bg-neutral-900 text-xs";

  const h = await headers();
  const basePath = h.get("x-pathname") ?? "/dashboard";
  const makeHref = (r: string) => `${basePath}?range=${r}`;

  return (
    <main className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <div className="flex gap-2">
          <Link className={range === "today" ? activeBtn : quietBtn} href={makeHref("today")}>Today</Link>
          <Link className={range === "week" ? activeBtn : quietBtn} href={makeHref("week")}>Week</Link>
          <Link className={range === "month" ? activeBtn : quietBtn} href={makeHref("month")}>Month</Link>
          <Link className={range === "ytd" ? activeBtn : quietBtn} href={makeHref("ytd")}>YTD</Link>
        </div>
      </div>

      {/* top KPIs */}
      <section className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="border rounded p-4">
          <div className="text-xs opacity-80">MONTH — SALES</div>
          <div className="text-2xl font-semibold">{money(salesThis)}</div>
          <div className="text-[11px] opacity-70 mt-1">
            <span className={pct(salesThis, salesPrevMonth) >= 0 ? "text-emerald-400" : "text-rose-400"}>
              {pct(salesThis, salesPrevMonth).toFixed(1)}% MoM
            </span>
          </div>
        </div>
        <div className="border rounded p-4">
          <div className="text-xs opacity-80">MONTH — EXPENSES</div>
          <div className="text-2xl font-semibold">{money(expensesThis)}</div>
          <div className="text-[11px] opacity-70 mt-1">
            <span className={pct(expensesThis, expensesPrevMonth) >= 0 ? "text-emerald-400" : "text-rose-400"}>
              {pct(expensesThis, expensesPrevMonth).toFixed(1)}% MoM
            </span>
          </div>
        </div>
        <div className="border rounded p-4">
          <div className="text-xs opacity-80">MONTH — PROFIT / LOSS</div>
          <div className="text-2xl font-semibold">{money(profitThis)}</div>
          <div className="text-[11px] opacity-70 mt-1">
            <span className={pct(profitThis, profitPrevMonth) >= 0 ? "text-emerald-400" : "text-rose-400"}>
              {pct(profitThis, profitPrevMonth).toFixed(1)}% MoM
            </span>
          </div>
        </div>
        <div className="border rounded p-4 col-span-2">
          <div className="text-xs opacity-80">SALES vs GOAL</div>
          <div className="text-2xl font-semibold">{money(salesThis)}</div>
          <div className="mt-2">
            <div className="w-full h-2 bg-neutral-800 rounded">
              <div
                className="h-2 bg-pink-500 rounded"
                style={{ width: `${Math.min(100, salesGoal > 0 ? (salesThis / salesGoal) * 100 : 0)}%` }}
              />
            </div>
            <form action={setGoal} className="flex gap-2 mt-2">
              <input
                name="goal"
                defaultValue={salesGoal}
                className="w-24 rounded border bg-black px-2 py-1 text-xs"
                inputMode="numeric"
              />
              <button className="px-3 py-1 rounded border hover:bg-neutral-900 text-xs" type="submit">Save</button>
            </form>
          </div>
        </div>
      </section>

      {/* mini KPIs with tooltips */}
      <section className="grid grid-cols-1 md:grid-cols-5 gap-4 mt-4">
        <div className="border rounded p-4" title="Total number of orders in the selected range.">
          <div className="text-xs opacity-80">ORDERS (∑)</div>
          <div className="text-xl font-semibold">{ordersThis}</div>
        </div>
        <div className="border rounded p-4" title="Average Order Value = Sales ÷ Orders for the selected range.">
          <div className="text-xs opacity-80">AOV (∑)</div>
          <div className="text-xl font-semibold">{money(aovThis)}</div>
        </div>
        <div className="border rounded p-4" title="Food Cost % = Food expenses ÷ Sales for the selected range.">
          <div className="text-xs opacity-80">FOOD %</div>
          <div className="text-xl font-semibold">{Math.round(foodPct)}%</div>
        </div>
        <div className="border rounded p-4" title="Labor % = Labor expenses ÷ Sales for the selected range.">
          <div className="text-xs opacity-80">LABOR %</div>
          <div className="text-xl font-semibold">{Math.round(laborPct)}%</div>
        </div>
        <div className="border rounded p-4" title="Prime Cost % = Food % + Labor % for the selected range.">
          <div className="text-xs opacity-80">PRIME %</div>
          <div className="text-xl font-semibold">{Math.round(primePct)}%</div>
        </div>
      </section>

      {/* main charts */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <div className="border rounded p-3">
          <div className="text-sm opacity-80 mb-2">
            Sales vs Expenses — {range === "today" ? "last 12 days" : range === "week" ? "last 12 weeks" : range === "ytd" ? "YTD (by month)" : "last 12 months"}
          </div>
          <SalesVsExpensesChart
            data={series.map((r) => ({ key: r.key, sales: r.sales, expenses: r.expenses, profit: r.profit }))}
          />
        </div>

        <div className="border rounded p-3">
          <div className="text-sm opacity-80 mb-2">Expense breakdown — current range</div>
          <ExpenseDonut
            data={expenseBreakdown.map((x) => ({ name: x.name, value: x.value }))}
          />
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <div className="border rounded p-3">
          <div className="text-sm opacity-80 mb-2">Weekday revenue (this month)</div>
          <WeekdayBars labels={weekdayLabels} values={weekdayValues} formatter={money} />
        </div>
        <div className="border rounded p-3">
          <div className="text-sm opacity-80 mb-2">Top items — current range</div>
          <TopItemsChart data={topItems} formatter={money} />
        </div>
      </section>

      {/* bottom table */}
      <section className="border rounded mt-4">
        <div className="px-4 py-3 border-b text-sm opacity-80">Last 4 {range === "today" ? "days" : range === "week" ? "weeks" : "months"} (quick look)</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
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
              {series.slice(-4).map((r) => {
                const profit = r.sales - r.expenses;
                const aov = r.orders > 0 ? r.sales / r.orders : 0;
                return (
                  <tr key={r.key} className="border-t">
                    <td className="px-4 py-2">{r.key}</td>
                    <td className="px-4 py-2 text-right">{money(aov)}</td>
                    <td className="px-4 py-2 text-right">{r.orders}</td>
                    <td className="px-4 py-2 text-right">{money(r.sales)}</td>
                    <td className="px-4 py-2 text-right">{money(r.expenses)}</td>
                    <td className={`px-4 py-2 text-right ${profit < 0 ? "text-rose-400" : ""}`}>{money(profit)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex gap-2 px-4 py-3">
          <Link href="/sales" className="rounded border px-3 py-1 hover:bg-neutral-900 text-sm">Sales details</Link>
          <Link href="/expenses" className="rounded border px-3 py-1 hover:bg-neutral-900 text-sm">Expenses details</Link>
        </div>
      </section>
    </main>
  );
}
