import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";

/* ----------------------------- tiny helpers ----------------------------- */
const fmtUSD = (n: number) =>
  (n || 0).toLocaleString(undefined, { style: "currency", currency: "USD" });
const pad = (n: number) => n.toString().padStart(2, "0");
const today = new Date();
const monthStr = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
const yearStr = (d: Date) => `${d.getUTCFullYear()}`;
const firstDayOfMonth = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
const lastDayOfMonth = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
const toISODate = (d: Date) => d.toISOString().slice(0, 10);

/* ----------------------------- DB helpers ------------------------------ */
async function getTenantId(supabase: any): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: prof } = await supabase.from("profiles").select("tenant_id").eq("id", user.id).maybeSingle();
  return (prof?.tenant_id as string | null) ?? null;
}

async function sumOne(
  supabase: any,
  view: string,
  periodCol: "day" | "week" | "month" | "year",
  key: string,
  tenantId: string | null,
  col: "revenue" | "total" | "orders",
): Promise<number> {
  if (!tenantId) return 0;
  const { data } = await supabase
    .from(view)
    .select(col)
    .eq("tenant_id", tenantId)
    .eq(periodCol, key)
    .maybeSingle();
  const raw = (data as any)?.[col];
  return typeof raw === "number" ? raw : Number(raw ?? 0);
}

async function rangeExpensesByCategory(
  supabase: any,
  tenantId: string,
  startISO: string,
  endISO: string
): Promise<Array<{ name: string; value: number }>> {
  const { data, error } = await supabase
    .from("expenses")
    .select("category, amount_usd, occurred_at, created_at")
    .eq("tenant_id", tenantId)
    .or(`and(occurred_at.gte.${startISO},occurred_at.lte.${endISO}),and(occurred_at.is.null,created_at.gte.${startISO},created_at.lte.${endISO})`);
  if (error || !data) return [];
  const m = new Map<string, number>();
  for (const r of data) {
    const k = r.category || "Other";
    m.set(k, (m.get(k) || 0) + Number(r.amount_usd || 0));
  }
  const rows = Array.from(m.entries()).map(([name, value]) => ({ name, value }));
  // keep just a handful visually useful categories
  rows.sort((a, b) => b.value - a.value);
  return rows;
}

async function topItemsForRange(
  supabase: any,
  tenantId: string,
  startISO: string,
  endISO: string
): Promise<Array<{ name: string; revenue: number }>> {
  // join order_lines -> sales_orders and filter by date/tenant
  const { data, error } = await supabase
    .from("sales_order_lines")
    .select("product, qty, unit_price, sales_orders!inner(tenant_id, occurred_at, created_at)")
    .eq("sales_orders.tenant_id", tenantId)
    .or(
      `and(sales_orders.occurred_at.gte.${startISO},sales_orders.occurred_at.lte.${endISO}),` +
        `and(sales_orders.occurred_at.is.null,sales_orders.created_at.gte.${startISO},sales_orders.created_at.lte.${endISO})`
    )
    .limit(5000); // safe cap for demo
  if (error || !data) return [];
  const m = new Map<string, number>();
  for (const r of data as any[]) {
    const name = r.product || "Unknown";
    const revenue = Number(r.qty || 0) * Number(r.unit_price || 0);
    m.set(name, (m.get(name) || 0) + revenue);
  }
  return [...m.entries()]
    .map(([name, revenue]) => ({ name, revenue }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(5 * -1 * -1, 5) // just to be explicit: top 5
    .slice(0, 5);
}

async function weekdayRevenueThisMonth(
  supabase: any,
  tenantId: string
): Promise<Array<{ label: string; amount: number }>> {
  // pull days for current month from v_sales_day_totals
  const start = toISODate(firstDayOfMonth(today));
  const end = toISODate(lastDayOfMonth(today));
  const { data, error } = await supabase
    .from("v_sales_day_totals")
    .select("day, revenue")
    .eq("tenant_id", tenantId)
    .gte("day", start)
    .lte("day", end)
    .order("day", { ascending: true });
  if (error || !data) return [];
  const totals = [0, 0, 0, 0, 0, 0, 0]; // Sun..Sat
  for (const r of data as any[]) {
    const d = new Date(r.day + "T00:00:00Z");
    totals[d.getUTCDay()] += Number(r.revenue || 0);
  }
  const label = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return label.map((l, i) => ({ label: l, amount: totals[i] }));
}

/* ------------------------------ UI helpers ------------------------------ */
function Delta({ value }: { value: number }) {
  const color = value > 0 ? "text-emerald-400" : value < 0 ? "text-rose-400" : "text-neutral-400";
  const sign = value > 0 ? "+" : "";
  return <div className={`text-xs mt-1 ${color}`}>{sign}{value.toFixed(1)}% MoM</div>;
}

function Tile({
  title,
  value,
  tooltip,
  children,
}: {
  title: string;
  value: string;
  tooltip?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="border rounded p-4">
      <div className="text-xs opacity-80" title={tooltip}>{title}</div>
      <div className="text-2xl font-semibold">{value}</div>
      {children}
    </div>
  );
}

/* ------------------------------- Page ------------------------------- */
import { SalesVsExpensesChart, ExpenseDonut, TopItemsChart } from "./charts";

export default async function DashboardPage() {
  const supabase = await createServerClient();
  const tenantId = await getTenantId(supabase);
  const thisMonthKey = monthStr(today);
  const thisYearKey = yearStr(today);

  // Sales/Orders/Expenses aggregates (current month)
  const [salesMonth, ordersMonth, expMonth] = await Promise.all([
    sumOne(supabase, "v_sales_month_totals", "month", thisMonthKey, tenantId, "revenue"),
    sumOne(supabase, "v_sales_month_totals", "month", thisMonthKey, tenantId, "orders"),
    sumOne(supabase, "v_expense_month_totals", "month", thisMonthKey, tenantId, "total"),
  ]);
  const profitMonth = salesMonth - expMonth;

  // MoM deltas (month minus previous month)
  const prevMonthDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
  const prevMonthKey = monthStr(prevMonthDate);
  const [salesPrev, expPrev] = await Promise.all([
    sumOne(supabase, "v_sales_month_totals", "month", prevMonthKey, tenantId, "revenue"),
    sumOne(supabase, "v_expense_month_totals", "month", prevMonthKey, tenantId, "total"),
  ]);
  const profitPrev = salesPrev - expPrev;
  const pct = (now: number, prev: number) => (prev === 0 ? 0 : ((now - prev) / Math.max(1, prev)) * 100);
  const salesMoM = pct(salesMonth, salesPrev);
  const expMoM = pct(expMonth, expPrev);
  const profitMoM = pct(profitMonth, profitPrev);

  // KPI tiles: AOV, Food%, Labor%, Prime%
  const aov = ordersMonth > 0 ? salesMonth / ordersMonth : 0;

  // Food/Labor totals for this month (from raw expenses)
  const startISO = toISODate(firstDayOfMonth(today));
  const endISO = toISODate(lastDayOfMonth(today));
  const catRows = tenantId ? await rangeExpensesByCategory(supabase, tenantId, startISO, endISO) : [];
  const getCat = (name: string) => catRows.find((r) => r.name.toLowerCase() === name.toLowerCase())?.value || 0;
  const foodTotal = getCat("Food");
  const laborTotal = getCat("Labor");
  const foodPct = salesMonth > 0 ? (foodTotal / salesMonth) * 100 : 0;
  const laborPct = salesMonth > 0 ? (laborTotal / salesMonth) * 100 : 0;
  const primePct = Math.min(100, foodPct + laborPct);

  // Top items for current range
  const topItems = tenantId ? await topItemsForRange(supabase, tenantId, startISO, endISO) : [];

  // Weekday revenue bars
  const weekday = tenantId ? await weekdayRevenueThisMonth(supabase, tenantId) : [];

  // 12mo Sales vs Expenses line
  const months: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1));
    months.push(monthStr(d));
  }
  const salesSeries = await Promise.all(
    months.map((k) => sumOne(supabase, "v_sales_month_totals", "month", k, tenantId, "revenue"))
  );
  const expSeries = await Promise.all(
    months.map((k) => sumOne(supabase, "v_expense_month_totals", "month", k, tenantId, "total"))
  );
  const lineData = months.map((m, i) => ({
    month: m,
    sales: salesSeries[i],
    expenses: expSeries[i],
    profit: salesSeries[i] - expSeries[i],
  }));

  // Last 4 months quick table
  const last4 = months.slice(-4);
  const last4Sales = await Promise.all(
    last4.map((k) => sumOne(supabase, "v_sales_month_totals", "month", k, tenantId, "revenue"))
  );
  const last4Orders = await Promise.all(
    last4.map((k) => sumOne(supabase, "v_sales_month_totals", "month", k, tenantId, "orders"))
  );
  const last4Exp = await Promise.all(
    last4.map((k) => sumOne(supabase, "v_expense_month_totals", "month", k, tenantId, "total"))
  );
  const last4Rows = last4.map((m, i) => {
    const sales = last4Sales[i];
    const orders = Math.max(0, Math.floor(last4Orders[i]));
    const aovM = orders > 0 ? sales / orders : 0;
    const expenses = last4Exp[i];
    const profit = sales - expenses;
    return { month: m, sales, orders, aov: aovM, expenses, profit };
  });

  return (
    <main className="max-w-7xl mx-auto px-4 py-6 space-y-4">
      {/* Range toggles remain (non-interactive server version) */}
      <div className="flex gap-2 mb-2">
        <button className="px-3 py-1 rounded border opacity-60 cursor-not-allowed">Today</button>
        <button className="px-3 py-1 rounded border opacity-60 cursor-not-allowed">Week</button>
        <button className="px-3 py-1 rounded border">Month</button>
        <button className="px-3 py-1 rounded border opacity-60 cursor-not-allowed">YTD</button>
        <div className="ml-auto flex gap-2">
          <Link href="/sales/import" className="rounded border px-3 py-1 hover:bg-neutral-900 text-sm">
            Import Sales CSV
          </Link>
          <Link href="/expenses/import" className="rounded border px-3 py-1 hover:bg-neutral-900 text-sm">
            Import Expenses CSV
          </Link>
        </div>
      </div>

      {/* Top tiles */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Tile title="MONTH — SALES" value={fmtUSD(salesMonth)}>
          <Delta value={salesMoM} />
        </Tile>
        <Tile title="MONTH — EXPENSES" value={fmtUSD(expMonth)}>
          <Delta value={expMoM} />
        </Tile>
        <Tile title="MONTH — PROFIT / LOSS" value={fmtUSD(profitMonth)}>
          <Delta value={profitMoM} />
        </Tile>
        <div className="border rounded p-4">
          <div className="text-xs opacity-80">SALES vs GOAL</div>
          <div className="text-2xl font-semibold">{fmtUSD(salesMonth)}</div>
          {/* Simple goal widget kept from earlier version */}
          <div className="mt-2 text-xs opacity-80">Goal $10,000.00</div>
          <div className="h-2 bg-neutral-800 rounded mt-1 overflow-hidden">
            <div
              className="h-2 bg-pink-500"
              style={{ width: `${Math.min(100, (salesMonth / 10000) * 100)}%` }}
            />
          </div>
        </div>
      </section>

      {/* KPI tiles with tooltips */}
      <section className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Tile title="ORDERS (M)" value={String(ordersMonth)} tooltip="Total orders recorded this month (distinct sales orders)."/>
        <Tile title="AOV (M)" value={fmtUSD(aov)} tooltip="Average Order Value = Sales / Orders for this month." />
        <Tile title="FOOD %" value={`${Math.round(foodPct)}%`} tooltip="Food Cost % = Food expenses / Sales for this month." />
        <Tile title="LABOR %" value={`${Math.round(laborPct)}%`} tooltip="Labor Cost % = Labor expenses / Sales for this month." />
        <Tile title="PRIME %" value={`${Math.round(primePct)}%`} tooltip="Prime Cost % = Food % + Labor % (target ≤ 60%)." />
      </section>

      {/* Charts row */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SalesVsExpensesChart data={lineData} />
        <ExpenseDonut data={[
          { name: "Food", value: foodTotal },
          { name: "Labor", value: laborTotal },
          ...catRows
            .filter(c => !["Food","Labor"].includes(c.name))
            .slice(0, 5)
        ]} />
      </section>

      {/* Weekday + Top items */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="border rounded p-4">
          <div className="text-sm opacity-80 mb-2">Weekday revenue (this month)</div>
          <div className="space-y-2">
            {weekday.map((w) => (
              <div key={w.label} className="flex items-center gap-3">
                <div className="w-8 opacity-70 text-sm">{w.label}</div>
                <div className="flex-1 h-2 bg-neutral-800 rounded overflow-hidden">
                  <div
                    className="h-2 bg-neutral-300"
                    style={{
                      width: `${Math.min(
                        100,
                        (w.amount / Math.max(1, Math.max(...weekday.map(x => x.amount))))
                      ) * 100}%`,
                    }}
                  />
                </div>
                <div className="w-24 text-right text-sm">{fmtUSD(w.amount)}</div>
              </div>
            ))}
          </div>
        </div>
        <TopItemsChart data={topItems} />
      </section>

      {/* Last 4 months quick table */}
      <section className="border rounded">
        <div className="px-4 py-3 border-b text-sm opacity-80">Last 4 months (quick look)</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="opacity-80">
              <tr className="border-b">
                <th className="text-left p-2">Period</th>
                <th className="text-right p-2">Sales</th>
                <th className="text-right p-2">Orders</th>
                <th className="text-right p-2">AOV</th>
                <th className="text-right p-2">Expenses</th>
                <th className="text-right p-2">Profit</th>
              </tr>
            </thead>
            <tbody>
              {last4Rows.map((r) => (
                <tr key={r.month} className="border-b">
                  <td className="p-2">
                    <span className="underline">{r.month}</span>
                  </td>
                  <td className="p-2 text-right">{fmtUSD(r.sales)}</td>
                  <td className="p-2 text-right">{r.orders.toLocaleString()}</td>
                  <td className="p-2 text-right">{fmtUSD(r.aov)}</td>
                  <td className="p-2 text-right">{fmtUSD(r.expenses)}</td>
                  <td className={`p-2 text-right ${r.profit < 0 ? "text-rose-400" : ""}`}>{fmtUSD(r.profit)}</td>
                </tr>
              ))}
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
