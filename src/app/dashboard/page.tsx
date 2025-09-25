import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";

/** ---- tiny local date helpers (no external deps) ---- */
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
// ISO week as IYYY-Www (matches the view label)
function weekStr(d = new Date()) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7)); // Thursday decides the year
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${pad(weekNo)}`;
}
const fmtUSD = (n: number) =>
  (n || 0).toLocaleString(undefined, { style: "currency", currency: "USD" });

/** ----- Query helpers (NO tenant filter; views already route via tenant_for_select) ----- */
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
  return Number(data?.[valueCol] ?? 0);
}

async function daySeries(
  supabase: any,
  view: string,
  startDay: string,
  valueCol: "revenue" | "total"
): Promise<Array<{ day: string; amount: number }>> {
  const { data, error } = await supabase
    .from(view)
    .select(`day, ${valueCol}`)
    .gte("day", startDay)
    .order("day", { ascending: true });
  if (error) return [];
  return (data ?? []).map((r: any) => ({
    day: String(r.day),
    amount: Number(r?.[valueCol] ?? 0),
  }));
}

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createServerClient();

  const today = todayStr();
  const thisWeek = weekStr();
  const thisMonth = monthStr();
  const thisYear = yearStr();
  const last7Start = todayStr(addDays(new Date(), -6));

  // ---- SALES (use revenue) ----
  const [salesToday, salesWeek, salesMonth, salesYTD] = await Promise.all([
    sumOne(supabase, "v_sales_day_totals", "day", today, "revenue"),
    sumOne(supabase, "v_sales_week_totals", "week", thisWeek, "revenue"),
    sumOne(supabase, "v_sales_month_totals", "month", thisMonth, "revenue"),
    sumOne(supabase, "v_sales_year_totals", "year", thisYear, "revenue"),
  ]);

  // ---- EXPENSES (use total) ----
  const [expToday, expWeek, expMonth, expYTD] = await Promise.all([
    sumOne(supabase, "v_expense_day_totals", "day", today, "total"),
    sumOne(supabase, "v_expense_week_totals", "week", thisWeek, "total"),
    sumOne(supabase, "v_expense_month_totals", "month", thisMonth, "total"),
    sumOne(supabase, "v_expense_year_totals", "year", thisYear, "total"),
  ]);

  const profitThisMonth = salesMonth - expMonth;
  const profitYTD = salesYTD - expYTD;

  const [sales7, exp7] = await Promise.all([
    daySeries(supabase, "v_sales_day_totals", last7Start, "revenue"),
    daySeries(supabase, "v_expense_day_totals", last7Start, "total"),
  ]);

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

      {/* Top row of stat cards */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="border rounded p-4">
          <div className="text-sm opacity-80">TODAY — SALES</div>
          <div className="text-2xl font-semibold">{fmtUSD(salesToday)}</div>
        </div>
        <div className="border rounded p-4">
          <div className="text-sm opacity-80">THIS WEEK — SALES</div>
          <div className="text-2xl font-semibold">{fmtUSD(salesWeek)}</div>
        </div>
        <div className="border rounded p-4">
          <div className="text-sm opacity-80">THIS MONTH — SALES</div>
          <div className="text-2xl font-semibold">{fmtUSD(salesMonth)}</div>
        </div>
        <div className="border rounded p-4">
          <div className="text-sm opacity-80">YTD — SALES</div>
          <div className="text-2xl font-semibold">{fmtUSD(salesYTD)}</div>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
        <div className="border rounded p-4">
          <div className="text-sm opacity-80">TODAY — EXPENSES</div>
          <div className="text-2xl font-semibold">{fmtUSD(expToday)}</div>
        </div>
        <div className="border rounded p-4">
          <div className="text-sm opacity-80">THIS WEEK — EXPENSES</div>
          <div className="text-2xl font-semibold">{fmtUSD(expWeek)}</div>
        </div>
        <div className="border rounded p-4">
          <div className="text-sm opacity-80">THIS MONTH — EXPENSES</div>
          <div className="text-2xl font-semibold">{fmtUSD(expMonth)}</div>
        </div>
        <div className="border rounded p-4">
          <div className="text-sm opacity-80">YTD — EXPENSES</div>
          <div className="text-2xl font-semibold">{fmtUSD(expYTD)}</div>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <div className="border rounded p-4">
          <div className="text-sm opacity-80">THIS MONTH — PROFIT / LOSS</div>
          <div className={`text-2xl font-semibold ${profitThisMonth < 0 ? "text-rose-400" : ""}`}>
            {fmtUSD(profitThisMonth)}
          </div>
        </div>
        <div className="border rounded p-4">
          <div className="text-sm opacity-80">YTD — PROFIT / LOSS</div>
          <div className={`text-2xl font-semibold ${profitYTD < 0 ? "text-rose-400" : ""}`}>
            {fmtUSD(profitYTD)}
          </div>
        </div>
      </section>

      {/* Mini tables, last 7 days */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
        <div className="border rounded">
          <div className="px-4 py-3 border-b text-sm opacity-80">Last 7 days — Sales</div>
          <div className="px-4 py-3">
            {sales7.length === 0 ? (
              <div className="opacity-70 text-sm">No sales in the last 7 days.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="opacity-80">
                  <tr>
                    <th className="text-left font-normal">Day</th>
                    <th className="text-right font-normal">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {sales7.map((r) => (
                    <tr key={r.day} className="border-t">
                      <td className="py-1">{r.day}</td>
                      <td className="py-1 text-right">{fmtUSD(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
        <div className="border rounded">
          <div className="px-4 py-3 border-b text-sm opacity-80">Last 7 days — Expenses</div>
          <div className="px-4 py-3">
            {exp7.length === 0 ? (
              <div className="opacity-70 text-sm">No expenses in the last 7 days.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="opacity-80">
                  <tr>
                    <th className="text-left font-normal">Day</th>
                    <th className="text-right font-normal">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {exp7.map((r) => (
                    <tr key={r.day} className="border-t">
                      <td className="py-1">{r.day}</td>
                      <td className="py-1 text-right">{fmtUSD(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </section>

      <div className="flex gap-2 mt-6">
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
