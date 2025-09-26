// src/app/dashboard/page.tsx
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";

/** -------- tiny local helpers (no deps) -------- */
function pad(n: number) { return String(n).padStart(2, "0"); }
function todayUtc() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function monthKey(d = new Date()) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`; // YYYY-MM
}
function yearKey(d = new Date()) {
  return String(d.getUTCFullYear());
}
function startOfMonth(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
function addMonths(d: Date, n: number) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate()));
}
const fmtUSD = (n: number) =>
  (n || 0).toLocaleString(undefined, { style: "currency", currency: "USD" });
const fmtPct = (v: number) => `${(isFinite(v) ? v : 0).toFixed(0)}%`;

/** sum one number from an aggregate view for a period key */
async function sumOne(
  supabase: any,
  view: string,
  period: "day" | "week" | "month" | "year",
  key: string,
  tenantId: string | null,
  col: string
): Promise<number> {
  if (!tenantId) return 0;
  const { data, error } = await supabase
    .from(view)
    .select(col)
    .eq("tenant_id", tenantId)
    .eq(period, key)
    .maybeSingle();
  if (error) return 0;
  const v = (data as any)?.[col];
  return typeof v === "number" ? v : Number(v ?? 0);
}

/** raw sum from expenses table for a date range (UTC, inclusive start, exclusive end) */
async function sumExpenses(
  supabase: any,
  tenantId: string | null,
  start: Date,
  end: Date,
  categoryLike?: string // e.g. 'Food' or 'Labor'
): Promise<number> {
  if (!tenantId) return 0;
  let q = supabase
    .from("expenses")
    .select("amount_usd", { count: "exact", head: false })
    .eq("tenant_id", tenantId)
    .gte("occurred_at", start.toISOString())
    .lt("occurred_at", end.toISOString());
  if (categoryLike) q = q.ilike("category", categoryLike);
  const { data, error } = await q;
  if (error || !Array.isArray(data)) return 0;
  return data.reduce((acc: number, r: any) => acc + Number(r.amount_usd || 0), 0);
}

/** weekday buckets for current month from v_sales_day_totals */
async function weekdayRevenueThisMonth(
  supabase: any,
  tenantId: string | null,
  start: Date,
  end: Date
): Promise<{ label: string; amount: number }[]> {
  if (!tenantId) return [];
  const { data, error } = await supabase
    .from("v_sales_day_totals")
    .select("day, revenue")
    .eq("tenant_id", tenantId)
    .gte("day", start.toISOString().slice(0, 10))
    .lt("day", end.toISOString().slice(0, 10));
  if (error || !Array.isArray(data)) return [];
  // 0=Sun .. 6=Sat labels that are intuitive for restaurants (Mon-first)
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const buckets = new Array(7).fill(0);
  for (const r of data) {
    const d = new Date(r.day + "T00:00:00Z");
    const dow = d.getUTCDay(); // 0..6
    buckets[dow] += Number(r.revenue || 0);
  }
  return names.map((n, i) => ({ label: n, amount: buckets[i] || 0 }));
}

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createServerClient();

  // figure out tenant
  const { data: auth } = await supabase.auth.getUser();
  let tenantId: string | null = null;
  if (auth?.user) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", auth.user.id)
      .maybeSingle();
    tenantId = (prof?.tenant_id as string | null) ?? null;
  }

  const now = todayUtc();
  const mStart = startOfMonth(now);
  const mEnd = startOfMonth(addMonths(now, 1));
  const thisMonth = monthKey(now);
  const thisYear = yearKey(now);
  const prevMonth = monthKey(addMonths(now, -1));

  // ---- SALES & EXPENSES headline (month & YTD) ----
  const [salesMonth, salesYTD] = await Promise.all([
    sumOne(supabase, "v_sales_month_totals", "month", thisMonth, tenantId, "revenue"),
    sumOne(supabase, "v_sales_year_totals", "year", thisYear, tenantId, "revenue"),
  ]);
  const [expMonth, expYTD] = await Promise.all([
    sumOne(supabase, "v_expense_month_totals", "month", thisMonth, tenantId, "total"),
    sumOne(supabase, "v_expense_year_totals", "year", thisYear, tenantId, "total"),
  ]);
  const profitThisMonth = salesMonth - expMonth;

  // ---- Orders & AOV (from sales views) ----
  const [ordersMonth, salesPrevMonth] = await Promise.all([
    sumOne(supabase, "v_sales_month_totals", "month", thisMonth, tenantId, "orders"),
    sumOne(supabase, "v_sales_month_totals", "month", prevMonth, tenantId, "revenue"),
  ]);
  const aovMonth = ordersMonth > 0 ? salesMonth / ordersMonth : 0;
  const momChange = salesPrevMonth > 0 ? ((salesMonth - salesPrevMonth) / salesPrevMonth) * 100 : 0;

  // ---- Food / Labor / Prime % (current month) ----
  const [foodMonth, laborMonth] = await Promise.all([
    sumExpenses(supabase, tenantId, mStart, mEnd, "Food"),
    sumExpenses(supabase, tenantId, mStart, mEnd, "Labor"),
  ]);
  const foodPct = salesMonth > 0 ? (foodMonth / salesMonth) * 100 : 0;
  const laborPct = salesMonth > 0 ? (laborMonth / salesMonth) * 100 : 0;
  const primePct = foodPct + laborPct;

  // ---- Weekday revenue (current month) ----
  const weekday = await weekdayRevenueThisMonth(supabase, tenantId, mStart, mEnd);
  const maxWeekday = Math.max(1, ...weekday.map((x) => x.amount));

  // goal (simple constant for now; editable goal can be added in profile later)
  const monthlyGoal = 15000;
  const goalPct = Math.min(100, Math.round((salesMonth / monthlyGoal) * 100));

  return (
    <main className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <div className="flex gap-2">
          <Link href="/sales/import" className="rounded border px-3 py-1 hover:bg-neutral-900 text-sm">
            Import Sales CSV
          </Link>
          <Link href="/expenses/import" className="rounded border px-3 py-1 hover:bg-neutral-900 text-sm">
            Import Expenses CSV
          </Link>
        </div>
      </div>

      {/* Headline row */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="MONTH — SALES" value={fmtUSD(salesMonth)} />
        <StatCard title="MONTH — EXPENSES" value={fmtUSD(expMonth)} />
        <StatCard title="MONTH — PROFIT / LOSS" value={fmtUSD(profitThisMonth)} danger={profitThisMonth < 0} />
        <div className="border rounded p-4">
          <div className="text-sm opacity-80">SALES vs GOAL</div>
          <div className="text-2xl font-semibold">{fmtUSD(salesMonth)}</div>
          <div className="mt-2 text-xs opacity-70">Goal {fmtUSD(monthlyGoal)}</div>
          <div className="mt-2 h-2 rounded bg-neutral-800">
            <div
              className="h-2 rounded bg-pink-500"
              style={{ width: `${goalPct}%` }}
            />
          </div>
          <div className="mt-1 text-xs opacity-70">{goalPct}%</div>
        </div>
      </section>

      {/* KPI row */}
      <section className="grid grid-cols-1 md:grid-cols-5 gap-4 mt-4">
        <KpiCard label="ORDERS (M)" value={ordersMonth.toLocaleString()} />
        <KpiCard label="AOV (M)" value={fmtUSD(aovMonth)} />
        <KpiCard label="FOOD %" value={fmtPct(foodPct)} />
        <KpiCard label="LABOR %" value={fmtPct(laborPct)} />
        <KpiCard label="PRIME %" value={fmtPct(primePct)} />
      </section>

      {/* Trends */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <Panel title="Sales trend">
          <div className="text-xs opacity-70">{`${monthKey(addMonths(now, -1))} → ${monthKey(now)}`}</div>
          <div className="mt-4 text-sm">
            MoM change: <span className={momChange < 0 ? "text-rose-400" : ""}>{fmtPct(momChange)}</span>
          </div>
        </Panel>
        <Panel title="Weekday revenue (this month)">
          <div className="space-y-2">
            {weekday.map((d) => (
              <div key={d.label} className="flex items-center gap-2 text-sm">
                <div className="w-10 opacity-70">{d.label}</div>
                <div className="flex-1 h-2 rounded bg-neutral-800">
                  <div
                    className="h-2 rounded bg-neutral-300"
                    style={{ width: `${(d.amount / maxWeekday) * 100}%` }}
                  />
                </div>
                <div className="w-24 text-right tabular-nums">{fmtUSD(d.amount)}</div>
              </div>
            ))}
          </div>
        </Panel>
      </section>

      {/* Last 12 months tables that you already had (kept) */}
      <section className="mt-6 border rounded">
        <div className="px-4 py-3 border-b text-sm opacity-80">Last 12 months</div>
        <div className="grid grid-cols-1 md:grid-cols-2">
          <MonthTable supabase={supabase} tenantId={tenantId} side="sales" />
          <MonthTable supabase={supabase} tenantId={tenantId} side="expenses" />
        </div>
      </section>

      <div className="flex gap-2 mt-6">
        <Link href="/sales" className="rounded border px-3 py-1 hover:bg-neutral-900 text-sm">Sales details</Link>
        <Link href="/expenses" className="rounded border px-3 py-1 hover:bg-neutral-900 text-sm">Expenses details</Link>
      </div>
    </main>
  );
}

/** ---------- presentation bits ---------- */
function StatCard({ title, value, danger = false }: { title: string; value: string; danger?: boolean }) {
  return (
    <div className="border rounded p-4">
      <div className="text-sm opacity-80">{title}</div>
      <div className={`text-2xl font-semibold ${danger ? "text-rose-400" : ""}`}>{value}</div>
    </div>
  );
}
function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border rounded p-4">
      <div className="text-xs opacity-80">{label}</div>
      <div className="text-xl font-semibold mt-1">{value}</div>
    </div>
  );
}
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border rounded p-4">
      <div className="text-sm opacity-80">{title}</div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

/** ---------- Month table (uses same views you already rely on) ---------- */
async function MonthTable({
  supabase,
  tenantId,
  side,
}: {
  supabase: any;
  tenantId: string | null;
  side: "sales" | "expenses";
}) {
  const view =
    side === "sales" ? "v_sales_month_totals" : "v_expense_month_totals";
  const col = side === "sales" ? "revenue" : "total";
  let rows: any[] = [];
  if (tenantId) {
    const { data } = await supabase
      .from(view)
      .select(`month, ${col}`)
      .eq("tenant_id", tenantId)
      .order("month", { ascending: true })
      .limit(12);
    rows = (data ?? []) as any[];
  }
  return (
    <div className="p-4">
      <div className="text-sm opacity-80 mb-2 capitalize">{side}</div>
      <table className="w-full text-sm">
        <thead className="opacity-80">
          <tr>
            <th className="text-left font-normal">Period</th>
            <th className="text-right font-normal">Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.month} className="border-t">
              <td className="py-1">{r.month}</td>
              <td className="py-1 text-right tabular-nums">
                {fmtUSD(Number(r[col] ?? 0))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
