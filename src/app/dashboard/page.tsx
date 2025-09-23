import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { getEffectiveTenant } from "@/lib/effective-tenant";
import { fmtUSD } from "@/lib/costing";

export const dynamic = "force-dynamic";

// period helpers
function todayStr(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function monthStr(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}
function isoWeekStr(d = new Date()) {
  // ISO week
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((+date - +yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}
function yearStr(d = new Date()) {
  return String(d.getFullYear());
}
function addDays(d: Date, delta: number) {
  const nd = new Date(d);
  nd.setDate(nd.getDate() + delta);
  return nd;
}

type TotRow = { total?: number | string };
type DayRow = { day: string; total?: number | string };

// Accept a nullable tenant id and return 0 if missing (avoids TS union errors)
async function sumOne(
  table: string,
  periodCol: string,
  periodVal: string,
  tenantId: string | null,
  supabase: any
) {
  if (!tenantId) return 0;
  const { data, error } = await supabase
    .from(table)
    .select("total")
    .eq("tenant_id", tenantId)
    .eq(periodCol, periodVal)
    .limit(50);

  if (error || !data) return 0;
  return data.reduce((acc: number, r: TotRow) => acc + Number(r.total ?? 0), 0);
}

async function daySeries(
  table: string,
  tenantId: string | null,
  startDate: string,
  supabase: any
) {
  if (!tenantId) return [] as DayRow[];
  const { data, error } = await supabase
    .from(table)
    .select("day,total")
    .eq("tenant_id", tenantId)
    .gte("day", startDate)
    .order("day", { ascending: true });

  if (error || !data) return [] as DayRow[];
  return data as DayRow[];
}

export default async function DashboardPage() {
  const supabase = await createServerClient();
  const { data: au } = await supabase.auth.getUser();
  const user = au.user ?? null;

  if (!user) {
    return (
      <main className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-4">Sign in required.</p>
        <Link className="underline" href="/login?redirect=/dashboard">
          Go to login
        </Link>
      </main>
    );
  }

  const tenantId = await getEffectiveTenant(supabase);

  // current periods
  const today = todayStr();
  const thisMonth = monthStr();
  const thisWeek = isoWeekStr();
  const thisYear = yearStr();

  // last-7-days start
  const last7Start = todayStr(addDays(new Date(), -6));

  // SALES totals
  const [salesToday, salesWeek, salesMonth, salesYear] = await Promise.all([
    sumOne("v_sales_day_totals", "day", today, tenantId, supabase),
    sumOne("v_sales_week_totals", "week", thisWeek, tenantId, supabase),
    sumOne("v_sales_month_totals", "month", thisMonth, tenantId, supabase),
    sumOne("v_sales_year_totals", "year", thisYear, tenantId, supabase),
  ]);

  // EXPENSE totals
  const [expToday, expWeek, expMonth, expYear] = await Promise.all([
    sumOne("v_expense_day_totals", "day", today, tenantId, supabase),
    sumOne("v_expense_week_totals", "week", thisWeek, tenantId, supabase),
    sumOne("v_expense_month_totals", "month", thisMonth, tenantId, supabase),
    sumOne("v_expense_year_totals", "year", thisYear, tenantId, supabase),
  ]);

  // mini tables (last 7 days)
  const [salesDays, expDays] = await Promise.all([
    daySeries("v_sales_day_totals", tenantId, last7Start, supabase),
    daySeries("v_expense_day_totals", tenantId, last7Start, supabase),
  ]);

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <div className="flex gap-2">
          <Link
            href="/sales/import"
            className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
          >
            Import Sales CSV
          </Link>
          <Link
            href="/expenses/import"
            className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
          >
            Import Expenses CSV
          </Link>
        </div>
      </div>

      {/* KPI rows */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KPI title="Today — Sales" value={fmtUSD(salesToday)} />
        <KPI title="This Week — Sales" value={fmtUSD(salesWeek)} />
        <KPI title="This Month — Sales" value={fmtUSD(salesMonth)} />
        <KPI title="YTD — Sales" value={fmtUSD(salesYear)} />
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KPI title="Today — Expenses" value={fmtUSD(expToday)} />
        <KPI title="This Week — Expenses" value={fmtUSD(expWeek)} />
        <KPI title="This Month — Expenses" value={fmtUSD(expMonth)} />
        <KPI title="YTD — Expenses" value={fmtUSD(expYear)} />
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <KPI
          title="This Month — Profit / Loss"
          value={fmtUSD(salesMonth - expMonth)}
          accent={salesMonth - expMonth >= 0 ? "pos" : "neg"}
        />
        <KPI
          title="YTD — Profit / Loss"
          value={fmtUSD(salesYear - expYear)}
          accent={salesYear - expYear >= 0 ? "pos" : "neg"}
        />
      </section>

      {/* mini tables */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <MiniTable
          title="Last 7 days — Sales"
          rows={salesDays}
          empty="No sales in the last 7 days."
        />
        <MiniTable
          title="Last 7 days — Expenses"
          rows={expDays}
          empty="No expenses in the last 7 days."
        />
      </section>
    </main>
  );
}

function KPI({
  title,
  value,
  accent,
}: {
  title: string;
  value: string;
  accent?: "pos" | "neg";
}) {
  const accentClass =
    accent === "pos"
      ? "text-emerald-400"
      : accent === "neg"
      ? "text-rose-400"
      : "text-white";
  return (
    <div className="border rounded-lg p-4 bg-neutral-900/40">
      <div className="text-xs uppercase text-neutral-400 mb-2">{title}</div>
      <div className={`text-2xl font-semibold tabular-nums ${accentClass}`}>
        {value}
      </div>
    </div>
  );
}

function MiniTable({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: { day: string; total?: number | string }[];
  empty: string;
}) {
  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="px-3 py-2 text-sm bg-neutral-900/60">{title}</div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-neutral-300">
              <th className="px-3 py-2 text-left">Day</th>
              <th className="px-3 py-2 text-right w-40">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="px-3 py-3 text-neutral-400" colSpan={2}>
                  {empty}
                </td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr key={`${r.day}-${i}`} className="border-t">
                  <td className="px-3 py-2">
                    {r.day ? new Date(r.day as any).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtUSD(Number(r.total ?? 0))}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
