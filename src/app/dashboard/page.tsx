// src/app/dashboard/page.tsx
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { addDays, monthStr, todayStr, yearStr } from "@/lib/dates";

const usd = (n: number) => n.toLocaleString(undefined, { style: "currency", currency: "USD" });

type DayRow = { day: string; total: number };

async function getSum(table: string, col: string, v: string) {
  const supabase = await createServerClient();
  const { data } = await supabase.from(table).select("total").eq(col, v).limit(1).maybeSingle();
  return Number(data?.total ?? 0);
}

async function last7(table: string): Promise<DayRow[]> {
  const supabase = await createServerClient();
  const start = todayStr(addDays(new Date(), -6)); // inclusive, 7 rows max
  const { data } = await supabase
    .from(table)
    .select("day,total")
    .gte("day", start)
    .order("day", { ascending: true });
  return (data ?? []).map((r: any) => ({ day: r.day, total: Number(r.total ?? 0) }));
}

export default async function DashboardPage() {
  const today = todayStr();
  const thisMonth = monthStr();
  const thisYear = yearStr();

  // Sales
  const todaySales = await getSum("v_sales_day_totals", "day", today);
  const weekSales = (await last7("v_sales_day_totals")).reduce((s, r) => s + r.total, 0);
  const monthSales = await getSum("v_sales_month_totals", "month", thisMonth);
  const ytdSales = await getSum("v_sales_year_totals", "year", thisYear);

  // Expenses
  const todayExp = await getSum("v_expense_day_totals", "day", today);
  const weekExp = (await last7("v_expense_day_totals")).reduce((s, r) => s + r.total, 0);
  const monthExp = await getSum("v_expense_month_totals", "month", thisMonth);
  const ytdExp = await getSum("v_expense_year_totals", "year", thisYear);

  const monthProfit = monthSales - monthExp;
  const ytdProfit = ytdSales - ytdExp;

  const last7Sales = await last7("v_sales_day_totals");
  const last7Exp = await last7("v_expense_day_totals");

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <div className="flex gap-3">
          <Link href="/sales/import" className="rounded border px-3 py-1 hover:bg-neutral-900">
            Import Sales CSV
          </Link>
          <Link href="/expenses/import" className="rounded border px-3 py-1 hover:bg-neutral-900">
            Import Expenses CSV
          </Link>
        </div>
      </div>

      {/* headline cards */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="border rounded p-4">
          <div className="text-xs opacity-60 mb-2">TODAY — SALES</div>
          <div className="text-2xl font-semibold">{usd(todaySales)}</div>
        </div>
        <div className="border rounded p-4">
          <div className="text-xs opacity-60 mb-2">THIS WEEK — SALES</div>
          <div className="text-2xl font-semibold">{usd(weekSales)}</div>
        </div>
        <div className="border rounded p-4">
          <div className="text-xs opacity-60 mb-2">THIS MONTH — SALES</div>
          <div className="text-2xl font-semibold">{usd(monthSales)}</div>
        </div>
        <div className="border rounded p-4">
          <div className="text-xs opacity-60 mb-2">YTD — SALES</div>
          <div className="text-2xl font-semibold">{usd(ytdSales)}</div>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="border rounded p-4">
          <div className="text-xs opacity-60 mb-2">TODAY — EXPENSES</div>
          <div className="text-2xl font-semibold">{usd(todayExp)}</div>
        </div>
        <div className="border rounded p-4">
          <div className="text-xs opacity-60 mb-2">THIS WEEK — EXPENSES</div>
          <div className="text-2xl font-semibold">{usd(weekExp)}</div>
        </div>
        <div className="border rounded p-4">
          <div className="text-xs opacity-60 mb-2">THIS MONTH — EXPENSES</div>
          <div className="text-2xl font-semibold">{usd(monthExp)}</div>
        </div>
        <div className="border rounded p-4">
          <div className="text-xs opacity-60 mb-2">YTD — EXPENSES</div>
          <div className="text-2xl font-semibold">{usd(ytdExp)}</div>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="border rounded p-4">
          <div className="text-xs opacity-60 mb-2">THIS MONTH — PROFIT / LOSS</div>
          <div className={`text-2xl font-semibold ${monthProfit < 0 ? "text-rose-400" : ""}`}>
            {usd(monthProfit)}
          </div>
        </div>
        <div className="border rounded p-4">
          <div className="text-xs opacity-60 mb-2">YTD — PROFIT / LOSS</div>
          <div className={`text-2xl font-semibold ${ytdProfit < 0 ? "text-rose-400" : ""}`}>
            {usd(ytdProfit)}
          </div>
        </div>
      </section>

      {/* mini tables */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="border rounded">
          <div className="px-4 py-3 border-b text-sm font-medium">Last 7 days — Sales</div>
          <table className="w-full text-sm">
            <tbody>
              {last7Sales.length === 0 ? (
                <tr>
                  <td className="px-4 py-3 opacity-70">No sales in the last 7 days.</td>
                </tr>
              ) : (
                last7Sales.map((r) => (
                  <tr key={r.day} className="border-t">
                    <td className="px-4 py-2">{r.day}</td>
                    <td className="px-4 py-2 text-right">{usd(r.total)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="border rounded">
          <div className="px-4 py-3 border-b text-sm font-medium">Last 7 days — Expenses</div>
          <table className="w-full text-sm">
            <tbody>
              {last7Exp.length === 0 ? (
                <tr>
                  <td className="px-4 py-3 opacity-70">No expenses in the last 7 days.</td>
                </tr>
              ) : (
                last7Exp.map((r) => (
                  <tr key={r.day} className="border-t">
                    <td className="px-4 py-2">{r.day}</td>
                    <td className="px-4 py-2 text-right">{usd(r.total)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex gap-3">
        <Link href="/sales" className="rounded border px-3 py-1 hover:bg-neutral-900">Sales details</Link>
        <Link href="/expenses" className="rounded border px-3 py-1 hover:bg-neutral-900">Expenses details</Link>
      </div>
    </main>
  );
}
