import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** ---------------- date + label helpers (no external deps) ---------------- */
function pad(n: number) {
  return n.toString().padStart(2, "0");
}
function todayStr(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = pad(d.getUTCMonth() + 1);
  const day = pad(d.getUTCDate());
  return `${y}-${m}-${day}`;
}
function addDays(d: Date, delta: number) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() + delta);
  return x;
}
function monthStr(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = pad(d.getUTCMonth() + 1);
  return `${y}-${m}`;
}
function yearStr(d = new Date()) {
  return `${d.getUTCFullYear()}`;
}
// ISO week as IYYY-Www (matches our views)
function weekStr(d = new Date()) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${pad(weekNo)}`;
}
const fmtUSD = (n: number) =>
  (n || 0).toLocaleString(undefined, { style: "currency", currency: "USD" });

/** ---------------- tiny query helpers (NO tenant_id filter) ---------------- */
async function sumOne(
  supabase: any,
  view: string,
  periodCol: "day" | "week" | "month" | "year",
  periodKey: string,
  valueCol: "revenue" | "total"
): Promise<number> {
  const { data, error } = await supabase
    .from(view)
    .select(valueCol)
    .eq(periodCol, periodKey)
    .maybeSingle();
  if (error) return 0;
  return Number((data as any)?.[valueCol] ?? 0);
}

type KV = { label: string; amount: number };

/** day series from date forward (inclusive) */
async function daySeries(
  supabase: any,
  view: string,
  startDay: string,
  valueCol: "revenue" | "total"
): Promise<KV[]> {
  const { data, error } = await supabase
    .from(view)
    .select(`day, ${valueCol}`)
    .gte("day", startDay)
    .order("day", { ascending: true });
  if (error || !data) return [];
  return (data as any[]).map((r) => ({ label: String(r.day), amount: Number(r[valueCol] ?? 0) }));
}

/** week series */
async function weekSeries(
  supabase: any,
  view: string,
  limit: number,
  valueCol: "revenue" | "total"
): Promise<KV[]> {
  const { data, error } = await supabase
    .from(view)
    .select(`week, ${valueCol}`)
    .order("week", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return (data as any[])
    .map((r) => ({ label: String(r.week), amount: Number(r[valueCol] ?? 0) }))
    .reverse();
}

async function monthSeries(
  supabase: any,
  view: string,
  limit: number,
  valueCol: "revenue" | "total"
): Promise<KV[]> {
  const { data, error } = await supabase
    .from(view)
    .select(`month, ${valueCol}`)
    .order("month", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return (data as any[])
    .map((r) => ({ label: String(r.month), amount: Number(r[valueCol] ?? 0) }))
    .reverse();
}

/** ---------------- tiny SVG sparkline ---------------- */
function Sparkline({ values, width = 220, height = 48 }: { values: number[]; width?: number; height?: number }) {
  const max = Math.max(1, ...values);
  const stepX = values.length > 1 ? width / (values.length - 1) : width;
  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = height - (v / max) * height;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="48" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" opacity={0.9} />
    </svg>
  );
}

/** ------------------- page ------------------- */
type RangeKey = "today" | "week" | "month";

const GOALS: Record<RangeKey, number> = {
  today: 500,
  week: 3500,
  month: 15000,
};

export default async function DashboardPage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createServerClient();

  const sp = (await props.searchParams) ?? {};
  const raw = Array.isArray(sp.range) ? sp.range[0] : sp.range;
  const range = raw as RangeKey | undefined;
  const mode: RangeKey = range === "today" || range === "week" || range === "month" ? range : "month";

  const today = todayStr();
  const thisWeek = weekStr();
  const thisMonth = monthStr();
  const thisYear = yearStr();
  const last7Start = todayStr(addDays(new Date(), -6));

  // Snapshot: sales, expenses by selected range, plus YTD profit
  const [salesSel, expSel] = await (async () => {
    if (mode === "today") {
      const [s, e] = await Promise.all([
        sumOne(supabase, "v_sales_day_totals", "day", today, "revenue"),
        sumOne(supabase, "v_expense_day_totals", "day", today, "total"),
      ]);
      return [s, e] as const;
    }
    if (mode === "week") {
      const [s, e] = await Promise.all([
        sumOne(supabase, "v_sales_week_totals", "week", thisWeek, "revenue"),
        sumOne(supabase, "v_expense_week_totals", "week", thisWeek, "total"),
      ]);
      return [s, e] as const;
    }
    // month (default)
    const [s, e] = await Promise.all([
      sumOne(supabase, "v_sales_month_totals", "month", thisMonth, "revenue"),
      sumOne(supabase, "v_expense_month_totals", "month", thisMonth, "total"),
    ]);
    return [s, e] as const;
  })();

  const [salesYTD, expYTD] = await Promise.all([
    sumOne(supabase, "v_sales_year_totals", "year", thisYear, "revenue"),
    sumOne(supabase, "v_expense_year_totals", "year", thisYear, "total"),
  ]);
  const profitSel = salesSel - expSel;
  const profitYTD = salesYTD - expYTD;

  // Trends: series adapt to range
  const [salesSeries, expSeries] = await (async () => {
    if (mode === "today") {
      return await Promise.all([
        daySeries(supabase, "v_sales_day_totals", last7Start, "revenue"),
        daySeries(supabase, "v_expense_day_totals", last7Start, "total"),
      ]);
    }
    if (mode === "week") {
      return await Promise.all([
        weekSeries(supabase, "v_sales_week_totals", 12, "revenue"),
        weekSeries(supabase, "v_expense_week_totals", 12, "total"),
      ]);
    }
    return await Promise.all([
      monthSeries(supabase, "v_sales_month_totals", 12, "revenue"),
      monthSeries(supabase, "v_expense_month_totals", 12, "total"),
    ]);
  })();

  const goal = GOALS[mode];
  const pct = goal > 0 ? Math.min(100, Math.round((salesSel / goal) * 100)) : 0;
  const statusColor =
    pct >= 90 ? "bg-emerald-500" : pct >= 70 ? "bg-amber-500" : "bg-rose-500";

  return (
    <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
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

      {/* Range toggle */}
      <div className="flex gap-2 text-sm">
        <RangeLink label="Today" value="today" active={mode === "today"} />
        <RangeLink label="Week" value="week" active={mode === "week"} />
        <RangeLink label="Month" value="month" active={mode === "month"} />
      </div>

      {/* Snapshot row */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card title={`${mode.toUpperCase()} — SALES`} value={fmtUSD(salesSel)} />
        <Card title={`${mode.toUpperCase()} — EXPENSES`} value={fmtUSD(expSel)} />
        <Card title={`${mode.toUpperCase()} — PROFIT / LOSS`} value={fmtUSD(profitSel)} danger={profitSel < 0} />
        <div className="border rounded p-4">
          <div className="text-sm opacity-80">SALES vs GOAL</div>
          <div className="mt-1 text-2xl font-semibold">{fmtUSD(salesSel)}</div>
          <div className="mt-1 flex items-center justify-between text-xs opacity-75">
            <span>Goal {fmtUSD(goal)}</span>
            <span>{pct}%</span>
          </div>
          <div className="mt-2 h-2 rounded bg-neutral-800 overflow-hidden">
            <div className={`h-full ${statusColor}`} style={{ width: `${pct}%` }} />
          </div>
        </div>
      </section>

      {/* Trends */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TrendCard title="Sales trend" series={salesSeries} />
        <TrendCard title="Expenses trend" series={expSeries} />
      </section>

      {/* Recent table */}
      <section className="border rounded">
        <div className="px-4 py-3 border-b text-sm opacity-80">
          {mode === "today" ? "Last 7 days" : mode === "week" ? "Last 12 weeks" : "Last 12 months"}
        </div>
        <div className="grid md:grid-cols-2">
          <MiniTable title="Sales" rows={salesSeries} />
          <MiniTable title="Expenses" rows={expSeries} />
        </div>
      </section>

      {/* links */}
      <div className="flex gap-2">
        <Link href="/sales" className="rounded border px-3 py-1 hover:bg-neutral-900 text-sm">
          Sales details
        </Link>
        <Link href="/expenses" className="rounded border px-3 py-1 hover:bg-neutral-900 text-sm">
          Expenses details
        </Link>
      </div>
    </main>
  );
}

/** ---------------- UI bits ---------------- */
function RangeLink({ label, value, active }: { label: string; value: string; active: boolean }) {
  const base = "rounded px-3 py-1 border text-sm";
  return (
    <Link
      href={`/dashboard?range=${value}`}
      className={`${base} ${active ? "bg-neutral-900 border-neutral-700" : "hover:bg-neutral-900"}`}
    >
      {label}
    </Link>
  );
}

function Card({ title, value, danger }: { title: string; value: string; danger?: boolean }) {
  return (
    <div className="border rounded p-4">
      <div className="text-sm opacity-80">{title}</div>
      <div className={`text-2xl font-semibold ${danger ? "text-rose-400" : ""}`}>{value}</div>
    </div>
  );
}

function TrendCard({ title, series }: { title: string; series: { label: string; amount: number }[] }) {
  const values = series.map((s) => s.amount);
  return (
    <div className="border rounded p-4">
      <div className="text-sm opacity-80">{title}</div>
      <div className="mt-2 text-xs opacity-70">
        {series.length > 0 ? `${series[0].label} → ${series[series.length - 1].label}` : "No data"}
      </div>
      <div className="mt-2 text-neutral-300">
        <Sparkline values={values} />
      </div>
    </div>
  );
}

function MiniTable({ title, rows }: { title: string; rows: { label: string; amount: number }[] }) {
  const fmtLabel = (s: string) => s;
  return (
    <div className="p-4">
      <div className="text-sm opacity-80 mb-2">{title}</div>
      {rows.length === 0 ? (
        <div className="opacity-70 text-sm">No data.</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="opacity-80">
            <tr>
              <th className="text-left font-normal">Period</th>
              <th className="text-right font-normal">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-t">
                <td className="py-1">{fmtLabel(r.label)}</td>
                <td className="py-1 text-right">{fmtUSD(r.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
