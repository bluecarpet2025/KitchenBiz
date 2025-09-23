// src/app/financial/page.tsx
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { monthStr, yearStr } from "@/lib/dates";

// minimal formatter that always exists
const usd = (n: number) => n.toLocaleString(undefined, { style: "currency", currency: "USD" });

async function readSingleTotal(
  table: string,
  key: { col: string; value: string }
): Promise<number> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from(table)
    .select("total")
    .eq(key.col, key.value)
    .limit(1)
    .maybeSingle();

  if (error) return 0;
  return Number(data?.total ?? 0);
}

async function readYearFallbackFromMonths(
  monthlyTable: string,
  year: string
): Promise<number> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from(monthlyTable)
    .select("total, month")
    .like("month", `${year}-%`);

  if (error || !data) return 0;
  return data.reduce((sum, r) => sum + Number(r.total ?? 0), 0);
}

export default async function FinancialPage() {
  const thisMonth = monthStr();
  const thisYear = yearStr();

  // SALES
  const monthSales =
    (await readSingleTotal("v_sales_month_totals", { col: "month", value: thisMonth })) || 0;

  let ytdSales =
    (await readSingleTotal("v_sales_year_totals", { col: "year", value: thisYear })) || 0;

  // If the yearly view isn’t populated yet, sum the monthly rows instead.
  if (!ytdSales) {
    ytdSales = await readYearFallbackFromMonths("v_sales_month_totals", thisYear);
  }

  // EXPENSES
  const monthExpenses =
    (await readSingleTotal("v_expense_month_totals", { col: "month", value: thisMonth })) || 0;

  let ytdExpenses =
    (await readSingleTotal("v_expense_year_totals", { col: "year", value: thisYear })) || 0;

  if (!ytdExpenses) {
    ytdExpenses = await readYearFallbackFromMonths("v_expense_month_totals", thisYear);
  }

  const monthProfit = monthSales - monthExpenses;
  const ytdProfit = ytdSales - ytdExpenses;

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Financials</h1>
        <div className="flex gap-3">
          <Link href="/sales" className="rounded border px-3 py-1 hover:bg-neutral-900">
            Sales details
          </Link>
          <Link href="/expenses" className="rounded border px-3 py-1 hover:bg-neutral-900">
            Expenses details
          </Link>
        </div>
      </div>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="border rounded p-4">
          <div className="text-xs opacity-60 mb-2">THIS MONTH — SALES</div>
          <div className="text-2xl font-semibold">{usd(monthSales)}</div>
        </div>

        <div className="border rounded p-4">
          <div className="text-xs opacity-60 mb-2">THIS MONTH — EXPENSES</div>
          <div className="text-2xl font-semibold">{usd(monthExpenses)}</div>
        </div>

        <div className="border rounded p-4">
          <div className="text-xs opacity-60 mb-2">THIS MONTH — PROFIT / LOSS</div>
          <div className={`text-2xl font-semibold ${monthProfit < 0 ? "text-rose-400" : ""}`}>
            {usd(monthProfit)}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="border rounded p-4">
          <div className="text-xs opacity-60 mb-2">YEAR TO DATE — SALES</div>
          <div className="text-2xl font-semibold">{usd(ytdSales)}</div>
        </div>

        <div className="border rounded p-4">
          <div className="text-xs opacity-60 mb-2">YEAR TO DATE — EXPENSES</div>
          <div className="text-2xl font-semibold">{usd(ytdExpenses)}</div>
        </div>

        <div className="border rounded p-4">
          <div className="text-xs opacity-60 mb-2">YEAR TO DATE — PROFIT / LOSS</div>
          <div className={`text-2xl font-semibold ${ytdProfit < 0 ? "text-rose-400" : ""}`}>
            {usd(ytdProfit)}
          </div>
        </div>
      </section>
    </main>
  );
}
