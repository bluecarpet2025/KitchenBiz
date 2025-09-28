import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { SalesVsExpensesChart, ExpenseDonut, TopItemsChart } from "./charts";

/** ---------- tiny local utils ---------- */
const fmtUSD = (n: number) =>
  (n || 0).toLocaleString(undefined, { style: "currency", currency: "USD" });
const pad = (n: number) => String(n).padStart(2, "0");
const today = () => new Date();
function addDays(d: Date, n: number) {
  const c = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  c.setUTCDate(c.getUTCDate() + n);
  return c;
}
const dayKey = (d: Date) =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const monthKey = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
const yearKey = (d: Date) => `${d.getUTCFullYear()}`;
function weekKey(d: Date) {
  const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  dt.setUTCDate(dt.getUTCDate() + 4 - (dt.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((+dt - +yearStart) / 86400000 + 1) / 7);
  return `${dt.getUTCFullYear()}-W${pad(weekNo)}`;
}

/** -------- reused DB helpers -------- */
async function sumOne(
  supabase: any,
  view: string,
  periodCol: "day" | "week" | "month" | "year",
  key: string,
  tenantId: string,
  amountCol: "revenue" | "total" | "orders"
): Promise<number> {
  const { data } = await supabase
    .from(view)
    .select(amountCol)
    .eq("tenant_id", tenantId)
    .eq(periodCol, key)
    .maybeSingle();
  return Number((data as any)?.[amountCol] ?? 0);
}

async function seriesFor(
  supabase: any,
  tenantId: string,
  keyCol: "day" | "week" | "month",
  keys: string[]
): Promise<Array<{ key: string; sales: number; expenses: number; profit: number }>> {
  const [salesRes, expRes] = await Promise.all([
    supabase
      .from(
        keyCol === "day"
          ? "v_sales_day_totals"
          : keyCol === "week"
          ? "v_sales_week_totals"
          : "v_sales_month_totals"
      )
      .select(`${keyCol}, revenue`)
      .eq("tenant_id", tenantId)
      .in(keyCol, keys),
    supabase
      .from(
        keyCol === "day"
          ? "v_expense_day_totals"
          : keyCol === "week"
          ? "v_expense_week_totals"
          : "v_expense_month_totals"
      )
      .select(`${keyCol}, total`)
      .eq("tenant_id", tenantId)
      .in(keyCol, keys),
  ]);

  const salesMap = new Map<string, number>();
  (salesRes.data ?? []).forEach((r: any) => salesMap.set(r[keyCol], Number(r.revenue ?? 0)));
  const expMap = new Map<string, number>();
  (expRes.data ?? []).forEach((r: any) => expMap.set(r[keyCol], Number(r.total ?? 0)));

  return keys.map((k) => {
    const sales = salesMap.get(k) ?? 0;
    const expenses = expMap.get(k) ?? 0;
    return { key: k, sales, expenses, profit: sales - expenses };
  });
}

async function topItems(
  supabase: any,
  tenantId: string,
  startTs: string,
  endTsExcl: string,
  limit = 5
): Promise<Array<{ name: string; value: number }>> {
  const { data, error } = await supabase
    .from("sales_order_lines")
    .select(
      "product_name, qty, unit_price, sales_orders!inner(id,tenant_id,occurred_at,created_at)"
    )
    .eq("sales_orders.tenant_id", tenantId)
    .gte("sales_orders.occurred_at", startTs)
    .lt("sales_orders.occurred_at", endTsExcl);

  if (error || !data) return [];

  const acc = new Map<string, number>();
  for (const row of data) {
    const name = (row as any).product_name as string | null;
    if (!name) continue;
    const value = Number((row as any).qty ?? 0) * Number((row as any).unit_price ?? 0);
    acc.set(name, (acc.get(name) ?? 0) + value);
  }
  return Array.from(acc.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, value]) => ({ name, value }));
}

async function weekdayRevenueThisMonth(supabase: any, tenantId: string) {
  const n = today();
  const start = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 1));
  const end = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + 1, 1));
  const { data } = await supabase
    .from("v_sales_day_totals")
    .select("day, revenue")
    .eq("tenant_id", tenantId)
    .gte("day", dayKey(start))
    .lt("day", dayKey(end))
    .order("day");
  const sums = new Array(7).fill(0);
  (data ?? []).forEach((r: any) => {
    const d = new Date(r.day + "T00:00:00Z");
    sums[d.getUTCDay()] += Number(r.revenue ?? 0);
  });
  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return labels.map((name, i) => ({ name, value: sums[i] }));
}

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ [k: string]: string | string[] | undefined }>;
}) {
  // ✅ Next 15 requires awaiting searchParams
  const sp = (await searchParams) ?? {};
  const range = String(sp?.range ?? "month") as "today" | "week" | "month" | "ytd";

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let tenantId: string | null = null;
  if (user) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", user.id)
      .maybeSingle();
    tenantId = (prof?.tenant_id as string | null) ?? null;
  }
  if (!tenantId) {
    return (
      <main className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="opacity-80 mt-2">No tenant available.</p>
      </main>
    );
  }

  const now = today();
  const thisMonth = monthKey(now);
  const thisYear = yearKey(now);

  let keys: string[] = [];
  let label = "last 12 months";
  if (range === "today") {
    keys = Array.from({ length: 12 }, (_, i) => dayKey(addDays(now, -(11 - i))));
    label = "last 12 days";
  } else if (range === "week") {
    const base = addDays(now, -7 * 11);
    keys = Array.from({ length: 12 }, (_, i) => weekKey(addDays(base, i * 7)));
    label = "last 12 weeks";
  } else if (range === "ytd") {
    keys = Array.from({ length: now.getUTCMonth() + 1 }, (_, i) =>
      monthKey(new Date(Date.UTC(now.getUTCFullYear(), i, 1)))
    );
    label = "YTD (by month)";
  } else {
    const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
    keys = Array.from({ length: 12 }, (_, i) =>
      monthKey(new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + i, 1)))
    );
  }
  const keyCol = range === "today" ? "day" : range === "week" ? "week" : "month";

  // current-period totals
  let salesThis = 0,
    expThis = 0,
    ordersThis = 0,
    salesPrevMonth = 0;

  if (range === "today") {
    const k = dayKey(now);
    [salesThis, expThis, ordersThis] = await Promise.all([
      sumOne(supabase, "v_sales_day_totals", "day", k, tenantId, "revenue"),
      sumOne(supabase, "v_expense_day_totals", "day", k, tenantId, "total"),
      sumOne(supabase, "v_sales_day_totals", "day", k, tenantId, "orders"),
    ]);
    const prev = monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)));
    salesPrevMonth = await sumOne(supabase, "v_sales_month_totals", "month", prev, tenantId, "revenue");
  } else if (range === "week") {
    const k = weekKey(now);
    [salesThis, expThis, ordersThis] = await Promise.all([
      sumOne(supabase, "v_sales_week_totals", "week", k, tenantId, "revenue"),
      sumOne(supabase, "v_expense_week_totals", "week", k, tenantId, "total"),
      sumOne(supabase, "v_sales_week_totals", "week", k, tenantId, "orders"),
    ]);
    const prev = monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)));
    salesPrevMonth = await sumOne(supabase, "v_sales_month_totals", "month", prev, tenantId, "revenue");
  } else {
    const k = range === "ytd" ? thisYear : thisMonth;
    const [s, e, o] =
      range === "ytd"
        ? await Promise.all([
            sumOne(supabase, "v_sales_year_totals", "year", k, tenantId, "revenue"),
            sumOne(supabase, "v_expense_year_totals", "year", k, tenantId, "total"),
            sumOne(supabase, "v_sales_year_totals", "year", k, tenantId, "orders"),
          ])
        : await Promise.all([
            sumOne(supabase, "v_sales_month_totals", "month", k, tenantId, "revenue"),
            sumOne(supabase, "v_expense_month_totals", "month", k, tenantId, "total"),
            sumOne(supabase, "v_sales_month_totals", "month", k, tenantId, "orders"),
          ]);
    salesThis = s;
    expThis = e;
    ordersThis = o;
    const prev = monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)));
    salesPrevMonth = await sumOne(supabase, "v_sales_month_totals", "month", prev, tenantId, "revenue");
  }

  const aov = ordersThis > 0 ? salesThis / ordersThis : 0;

  // Food/Labor amounts this period (for %s)
  const periodStart =
    range === "today"
      ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
      : range === "week"
      ? addDays(now, -6)
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const periodEndExcl =
    range === "today"
      ? addDays(periodStart, 1)
      : range === "week"
      ? addDays(now, 1)
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  async function sumExpensesBy(cat: string) {
    const { data } = await supabase
      .from("expenses")
      .select("amount_usd")
      .eq("tenant_id", tenantId)
      .gte("occurred_at", periodStart.toISOString())
      .lt("occurred_at", periodEndExcl.toISOString())
      .ilike("category", cat);
    return (data ?? []).reduce((s: number, r: any) => s + Number(r.amount_usd ?? 0), 0);
  }
  const [foodAmt, laborAmt] = await Promise.all([sumExpensesBy("Food%"), sumExpensesBy("Labor%")]);
  const foodPct = salesThis > 0 ? Math.round((foodAmt / salesThis) * 100) : 0;
  const laborPct = salesThis > 0 ? Math.round((laborAmt / salesThis) * 100) : 0;
  const primePct = Math.min(100, foodPct + laborPct);

  const lineData = await seriesFor(supabase, tenantId, keyCol, keys);

  const { data: expRows } = await supabase
    .from("expenses")
    .select("category, amount_usd")
    .eq("tenant_id", tenantId)
    .gte("occurred_at", periodStart.toISOString())
    .lt("occurred_at", periodEndExcl.toISOString());
  const byCat = new Map<string, number>();
  (expRows ?? []).forEach((r: any) => {
    const k = String(r.category ?? "Other");
    byCat.set(k, (byCat.get(k) ?? 0) + Number(r.amount_usd ?? 0));
  });
  const donutData = Array.from(byCat.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, value]) => ({ name, value }));

  const weekday = await weekdayRevenueThisMonth(supabase, tenantId);

  const topItemsData = await topItems(
    supabase,
    tenantId,
    periodStart.toISOString(),
    periodEndExcl.toISOString()
  );

  // simple goal UI
  const goal = Math.max(1000, Math.round((salesPrevMonth || 10000) / 1000) * 1000);
  const pctToGoal = Math.min(100, Math.round(((salesThis || 0) / goal) * 100));

  const rangeTabs = [
    { key: "today", label: "Today" },
    { key: "week", label: "Week" },
    { key: "month", label: "Month" },
    { key: "ytd", label: "YTD" },
  ] as const;

  return (
    <main className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <div className="flex gap-2 text-sm">
          {rangeTabs.map((t) => (
            <Link
              key={t.key}
              href={`/dashboard?range=${t.key}`}
              className={`px-3 py-1 rounded border ${
                range === t.key ? "bg-neutral-900" : "hover:bg-neutral-900"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>
      </div>

      {/* KPI row */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <CardStat
          title={`${range.toUpperCase()} — SALES`}
          value={fmtUSD(salesThis)}
          hint="+MoM compares to last month’s sales."
          sub={
            range !== "today" && range !== "week" ? (
              <span className="text-xs opacity-70">
                +
                {salesPrevMonth
                  ? Math.round(((salesThis - salesPrevMonth) / salesPrevMonth) * 100)
                  : 0}
                % MoM
              </span>
            ) : null
          }
        />
        <CardStat title={`${range.toUpperCase()} — EXPENSES`} value={fmtUSD(expThis)} />
        <CardStat title={`${range.toUpperCase()} — PROFIT / LOSS`} value={fmtUSD(salesThis - expThis)} />
        <div className="border rounded p-4">
          <div className="text-xs opacity-70">SALES vs GOAL</div>
          <div className="text-xl font-semibold">{fmtUSD(salesThis)}</div>
          <div className="text-xs mt-1 opacity-70">Goal {fmtUSD(goal)}</div>
          <div className="h-2 bg-neutral-800 rounded mt-2">
            <div
              className="h-2 bg-pink-500 rounded"
              style={{ width: `${pctToGoal}%`, transition: "width .2s" }}
            />
          </div>
          <div className="text-right text-xs opacity-70 mt-1">{pctToGoal}%</div>
        </div>
      </section>

      {/* KPI mini row */}
      <section className="grid grid-cols-1 md:grid-cols-5 gap-4 mt-4">
        <Kpi title="ORDERS (M)" value={ordersThis} tooltip="Number of orders in this range." />
        <Kpi
          title="AOV (M)"
          value={fmtUSD(aov)}
          tooltip="Average order value = Sales ÷ Orders (current range)."
        />
        <Kpi title="FOOD %" value={`${foodPct}%`} tooltip="Food cost % of sales (current range)." />
        <Kpi title="LABOR %" value={`${laborPct}%`} tooltip="Labor cost % of sales (current range)." />
        <Kpi title="PRIME %" value={`${primePct}%`} tooltip="Prime cost = Food% + Labor%." />
      </section>

      {/* Charts row */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <SalesVsExpensesChart data={lineData} label={label} />
        <ExpenseDonut data={donutData} label="current range" />
      </section>

      {/* Second charts row */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        {/* Weekday bars */}
        <div className="border rounded p-3">
          <div className="text-sm opacity-80 mb-2">Weekday revenue (this month)</div>
          <div className="space-y-2">
            {weekday.map((r) => (
              <div key={r.name} className="flex items-center gap-3">
                <div className="w-8 text-sm opacity-70">{r.name}</div>
                <div className="flex-1 h-2 bg-neutral-800 rounded overflow-hidden">
                  <div
                    className="h-2 bg-neutral-300"
                    style={{
                      width: `${
                        Math.min(
                          100,
                          (r.value / Math.max(...weekday.map((x) => x.value || 1))) * 100
                        )
                      }%`,
                    }}
                  />
                </div>
                <div className="w-24 text-right text-sm tabular-nums">{fmtUSD(r.value)}</div>
              </div>
            ))}
          </div>
        </div>
        <TopItemsChart data={topItemsData} label="current range" />
      </section>

      {/* Last 4 months quick look */}
      <section className="border rounded p-3 mt-4">
        <div className="text-sm opacity-80 mb-2">Last 4 months (quick look)</div>
        <table className="w-full text-sm">
          <thead className="opacity-70">
            <tr className="border-b">
              <th className="text-left py-1">Period</th>
              <th className="text-right py-1">Sales</th>
              <th className="text-right py-1">Orders</th>
              <th className="text-right py-1">AOV</th>
              <th className="text-right py-1">Expenses</th>
              <th className="text-right py-1">Profit</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 4 }, (_, i) => {
              const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (3 - i), 1));
              const mk = monthKey(d);
              return <RowMonth key={mk} supabase={supabase} tenantId={tenantId!} monthKey={mk} />;
            })}
          </tbody>
        </table>
        <div className="flex gap-2 mt-3">
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

/** ----- small server components & UI bits ----- */
async function RowMonth({
  supabase,
  tenantId,
  monthKey,
}: {
  supabase: any;
  tenantId: string;
  monthKey: string;
}) {
  const [s, e, o] = await Promise.all([
    sumOne(supabase, "v_sales_month_totals", "month", monthKey, tenantId, "revenue"),
    sumOne(supabase, "v_expense_month_totals", "month", monthKey, tenantId, "total"),
    sumOne(supabase, "v_sales_month_totals", "month", monthKey, tenantId, "orders"),
  ]);
  const aov = o > 0 ? s / o : 0;
  return (
    <tr className="border-t">
      <td className="py-1">{monthKey}</td>
      <td className="py-1 text-right tabular-nums">{fmtUSD(s)}</td>
      <td className="py-1 text-right tabular-nums">{o}</td>
      <td className="py-1 text-right tabular-nums">{fmtUSD(aov)}</td>
      <td className="py-1 text-right tabular-nums">{fmtUSD(e)}</td>
      <td className="py-1 text-right tabular-nums">{fmtUSD(s - e)}</td>
    </tr>
  );
}

function CardStat({
  title,
  value,
  sub,
  hint,
}: {
  title: string;
  value: string;
  sub?: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="border rounded p-4">
      <div className="text-xs opacity-70 flex items-center gap-2">
        <span>{title}</span>
        {hint ? (
          <span className="inline-block text-[10px] opacity-60 border px-1 rounded" title={hint}>
            ?
          </span>
        ) : null}
      </div>
      <div className="text-2xl font-semibold">{value}</div>
      {sub}
    </div>
  );
}

function Kpi({
  title,
  value,
  className,
  tooltip,
}: {
  title: string;
  value: string | number;
  className?: string;
  tooltip?: string;
}) {
  return (
    <div className={`border rounded p-4 ${className ?? ""}`}>
      <div className="text-xs opacity-70 flex items-center gap-2">
        <span>{title}</span>
        {tooltip ? (
          <span className="inline-block text-[10px] opacity-60 border px-1 rounded" title={tooltip}>
            ?
          </span>
        ) : null}
      </div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}
