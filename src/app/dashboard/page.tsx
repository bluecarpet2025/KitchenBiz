import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";

/** ---------------- small utils (no deps) ---------------- */
function pad(n: number) { return String(n).padStart(2, "0"); }
function toDateUTC(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function startOfMonth(d = new Date()) { return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)); }
function endOfMonthExclusive(d = new Date()) { return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)); }
function startOfISOWeek(d = new Date()) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7; // 1..7 (Mon..Sun)
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
  // month
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

/** group expenses by category for a date range */
async function expenseBreakdown(
  supabase: any,
  tenantId: string | null,
  start: Date,
  end: Date
): Promise<Array<{ category: string; total: number }>> {
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
  return Array.from(map.entries())
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);
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

/** ---------- server action: save goal (local, not exported) ---------- */
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

  // Read user goal; tenant via RPC so demo mode works
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

  // SALES & ORDERS
  let salesThis = 0;
  let ordersThis = 0;

  if (range === "today") {
    const key = start.toISOString().slice(0, 10);
    salesThis = await sumOne(supabase, "v_sales_day_totals", "day", key, tenantId, "revenue");
    ordersThis = await sumOne(supabase, "v_sales_day_totals", "day", key, tenantId, "orders");
  } else if (range === "week") {
    // ISO IYYY-Www
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + 4 - ((date.getUTCDay() || 7))); // Thursday
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(((+date - +yearStart) / 86400000 + 1) / 7);
    const weekKey = `${date.getUTCFullYear()}-W${pad(weekNo)}`;
    salesThis = await sumOne(supabase, "v_sales_week_totals", "week", weekKey, tenantId, "revenue");
    ordersThis = await sumOne(supabase, "v_sales_week_totals", "week", weekKey, tenantId, "orders");
  } else if (range === "ytd") {
    salesThis = await sumOne(supabase, "v_sales_year_totals", "year", thisYear, tenantId, "revenue");
    ordersThis = await sumOne(supabase, "v_sales_year_totals", "year", thisYear, tenantId, "orders");
  } else {
    // month
    salesThis = await sumOne(supabase, "v_sales_month_totals", "month", thisMonth, tenantId, "revenue");
    ordersThis = await sumOne(supabase, "v_sales_month_totals", "month", thisMonth, tenantId, "orders");
  }

  // EXPENSES (range)
  const expensesThis = await sumExpenses(supabase, tenantId, start, end);
  const profitThis = salesThis - expensesThis;

  // AOV
  const aov = ordersThis > 0 ? salesThis / ordersThis : 0;

  // Food / Labor / Prime
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

  // Weekday revenue (month only)
  const weekday = range === "month" ? await weekdayRevenueThisMonth(supabase, tenantId, startOfMonth(now), endOfMonthExclusive(now)) : [];
  const maxWeekday = Math.max(1, ...weekday.map((x) => x.amount));

  // Expense breakdown
  const breakdown = await expenseBreakdown(supabase, tenantId, start, end);
  const totalExp = breakdown.reduce((a, r) => a + r.total, 0);

  // Last 12 months tables
  let sales12: any[] = [];
  let exp12: any[] = [];
  if (tenantId) {
    const { data: s } = await supabase.from("v_sales_month_totals").select("month, revenue").eq("tenant_id", tenantId).order("month", { ascending: true }).limit(12);
    const { data: e } = await supabase.from("v_expense_month_totals").select("month, total").eq("tenant_id", tenantId).order("month", { ascending: true }).limit(12);
    sales12 = s ?? [];
    exp12 = e ?? [];
  }

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
        <KpiCard label={`ORDERS`} value={ordersThis.toLocaleString()} />
        <KpiCard label={`AOV`} value={fmtUSD(aov)} />
        <KpiCard label="FOOD %" value={fmtPct0(foodPct)} />
        <KpiCard label="LABOR %" value={fmtPct0(laborPct)} />
        <KpiCard label="PRIME %" value={fmtPct0(primePct)} />
      </section>

      {/* Trends & breakdown */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <Panel title="Sales trend" subtitle={range === "month" ? `${monthKey(addMonths(now, -1))} → ${monthKey(now)}` : undefined}>
          {range === "month" ? (
            <div className="text-sm">
              MoM change: <span className={momChange < 0 ? "text-rose-400" : ""} title="(This month – Last month) / Last month">
                {fmtPct0(momChange)}
              </span>
            </div>
          ) : (
            <div className="text-sm opacity-70">Switch to Month range to see MoM.</div>
          )}
        </Panel>

        <Panel title="Weekday revenue" subtitle={range === "month" ? "(this month)" : "(switch to Month for details)"}>
          {range !== "month" ? (
            <div className="text-sm opacity-70">No weekday view for this range.</div>
          ) : (
            <div className="space-y-2">
              {weekday.map((d) => (
                <div key={d.label} className="flex items-center gap-2 text-sm">
                  <div className="w-10 opacity-70">{d.label}</div>
                  <div className="flex-1 h-2 rounded bg-neutral-800">
                    <div className="h-2 rounded bg-neutral-300" style={{ width: `${(d.amount / maxWeekday) * 100}%` }} />
                  </div>
                  <div className="w-24 text-right tabular-nums" title="Revenue">{fmtUSD(d.amount)}</div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </section>

      {/* Expense breakdown */}
      <section className="mt-4 border rounded">
        <div className="px-4 py-3 border-b text-sm opacity-80">Expense breakdown — {range.toUpperCase()}</div>
        <div className="p-4">
          {breakdown.length === 0 ? (
            <div className="text-sm opacity-70">No expenses for this range.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="opacity-80">
                <tr>
                  <th className="text-left font-normal">Category</th>
                  <th className="text-right font-normal">Amount</th>
                  <th className="text-right font-normal">Share</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.map((r) => {
                  const pct = totalExp > 0 ? (r.total / totalExp) * 100 : 0;
                  return (
                    <tr key={r.category} className="border-t">
                      <td className="py-1">{r.category || "Other"}</td>
                      <td className="py-1 text-right tabular-nums">{fmtUSD(r.total)}</td>
                      <td className="py-1 text-right tabular-nums" title="Category / Total expenses">{fmtPct0(pct)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Last 12 months with drill-down links */}
      <section className="mt-6 border rounded">
        <div className="px-4 py-3 border-b text-sm opacity-80">Last 12 months</div>
        <div className="grid grid-cols-1 md:grid-cols-2">
          <div className="p-4">
            <div className="text-sm opacity-80 mb-2">Sales</div>
            <table className="w-full text-sm">
              <thead className="opacity-80">
                <tr>
                  <th className="text-left font-normal">Period</th>
                  <th className="text-right font-normal">Amount</th>
                </tr>
              </thead>
              <tbody>
                {sales12.map((r) => (
                  <tr key={r.month} className="border-t">
                    <td className="py-1">
                      <Link className="underline" href={`/sales?month=${r.month}`}>{r.month}</Link>
                    </td>
                    <td className="py-1 text-right tabular-nums">{fmtUSD(num(r.revenue))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-4">
            <div className="text-sm opacity-80 mb-2">Expenses</div>
            <table className="w-full text-sm">
              <thead className="opacity-80">
                <tr>
                  <th className="text-left font-normal">Period</th>
                  <th className="text-right font-normal">Amount</th>
                </tr>
              </thead>
              <tbody>
                {exp12.map((r) => (
                  <tr key={r.month} className="border-t">
                    <td className="py-1">
                      <Link className="underline" href={`/expenses?month=${r.month}`}>{r.month}</Link>
                    </td>
                    <td className="py-1 text-right tabular-nums">{fmtUSD(num(r.total))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <div className="flex gap-2 mt-6">
        <Link href="/sales" className="rounded border px-3 py-1 hover:bg-neutral-900 text-sm">Sales details</Link>
        <Link href="/expenses" className="rounded border px-3 py-1 hover:bg-neutral-900 text-sm">Expenses details</Link>
      </div>
    </main>
  );
}

/** ---------------- presentational helpers ---------------- */
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
function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="border rounded p-4">
      <div className="text-sm opacity-80">{title}</div>
      {subtitle && <div className="text-xs opacity-60">{subtitle}</div>}
      <div className="mt-2">{children}</div>
    </div>
  );
}

/** Goal card with inline edit (server action) */
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

      {/* Inline edit form */}
      <form action={updateGoal} className="mt-3 flex items-center gap-2" title="Set a new monthly sales goal">
        <input
          name="goal"
          type="number"
          step="100"
          min="0"
          defaultValue={goal}
          className="w-28 rounded border bg-transparent px-2 py-1 text-sm"
        />
        <button className="rounded border px-3 py-1 text-sm hover:bg-neutral-900">
          Save
        </button>
      </form>
    </div>
  );
}
