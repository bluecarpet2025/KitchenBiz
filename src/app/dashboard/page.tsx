// src/app/dashboard/page.tsx
import { createServerClient } from "@/lib/supabase/server";
import { getEffectiveTenant } from "@/lib/effective-tenant";
import { todayStr, weekStr, monthStr, yearStr, addDays } from "@/lib/dates";
import { sumOne, daySeries } from "@/lib/metrics";

function fmtUSD(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export default async function DashboardPage() {
  const supabase = await createServerClient();
  const tenantId = await getEffectiveTenant(supabase);
  if (!tenantId) {
    // Keep UI predictable if somehow not signed in / no tenant
    return (
      <main className="max-w-6xl mx-auto p-6 space-y-6">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <div className="text-sm opacity-80">No tenant selected.</div>
      </main>
    );
  }

  // Period keys
  const today = todayStr();
  const thisWeek = weekStr();
  const thisMonth = monthStr();
  const thisYear = yearStr();
  const last7Start = todayStr(addDays(new Date(), -6));

  // SALES (use revenue)
  const [salesToday, salesWeek, salesMonth, salesYTD] = await Promise.all([
    sumOne(supabase, "v_sales_day_totals", "day", today, tenantId, "revenue"),
    sumOne(supabase, "v_sales_week_totals", "week", thisWeek, tenantId, "revenue"),
    sumOne(supabase, "v_sales_month_totals", "month", thisMonth, tenantId, "revenue"),
    sumOne(supabase, "v_sales_year_totals", "year", thisYear, tenantId, "revenue"),
  ]);

  // EXPENSES (use total)
  const [expToday, expWeek, expMonth, expYTD] = await Promise.all([
    sumOne(supabase, "v_expense_day_totals", "day", today, tenantId, "total"),
    sumOne(supabase, "v_expense_week_totals", "week", thisWeek, tenantId, "total"),
    sumOne(supabase, "v_expense_month_totals", "month", thisMonth, tenantId, "total"),
    sumOne(supabase, "v_expense_year_totals", "year", thisYear, tenantId, "total"),
  ]);

  // Mini tables (last 7 days)
  const [sales7, exp7] = await Promise.all([
    daySeries(supabase, "v_sales_day_totals", tenantId, last7Start, "revenue"),
    daySeries(supabase, "v_expense_day_totals", tenantId, last7Start, "total"),
  ]);

  const profitThisMonth = salesMonth - expMonth;
  const profitYTD = salesYTD - expYTD;

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card title="TODAY — SALES" value={fmtUSD(salesToday)} />
        <Card title="THIS WEEK — SALES" value={fmtUSD(salesWeek)} />
        <Card title="THIS MONTH — SALES" value={fmtUSD(salesMonth)} />
        <Card title="YTD — SALES" value={fmtUSD(salesYTD)} />

        <Card title="TODAY — EXPENSES" value={fmtUSD(expToday)} />
        <Card title="THIS WEEK — EXPENSES" value={fmtUSD(expWeek)} />
        <Card title="THIS MONTH — EXPENSES" value={fmtUSD(expMonth)} />
        <Card title="YTD — EXPENSES" value={fmtUSD(expYTD)} />

        <Card
          className="md:col-span-2"
          title="THIS MONTH — PROFIT / LOSS"
          value={fmtUSD(profitThisMonth)}
          highlightNegative
        />
        <Card
          className="md:col-span-2"
          title="YTD — PROFIT / LOSS"
          value={fmtUSD(profitYTD)}
          highlightNegative
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Table
          title="Last 7 days — Sales"
          rows={sales7.map((r) => ({ label: r.day, amount: r.amount }))}
          empty="No sales in the last 7 days."
        />
        <Table
          title="Last 7 days — Expenses"
          rows={exp7.map((r) => ({ label: r.day, amount: r.amount }))}
          empty="No expenses in the last 7 days."
        />
      </div>

      <div className="flex gap-3">
        <a className="px-3 py-2 border rounded text-sm hover:bg-neutral-900" href="/sales">
          Sales details
        </a>
        <a className="px-3 py-2 border rounded text-sm hover:bg-neutral-900" href="/expenses">
          Expenses details
        </a>
      </div>
    </main>
  );
}

function Card({
  title,
  value,
  className = "",
  highlightNegative = false,
}: {
  title: string;
  value: string;
  className?: string;
  highlightNegative?: boolean;
}) {
  const isNeg = highlightNegative && value.trim().startsWith("-");
  return (
    <div className={`border border-neutral-800 rounded p-4 ${className}`}>
      <div className="text-xs opacity-70 mb-2">{title}</div>
      <div className={`text-2xl font-semibold ${isNeg ? "text-red-400" : ""}`}>{value}</div>
    </div>
  );
}

function Table({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: Array<{ label: string; amount: number }>;
  empty: string;
}) {
  return (
    <div className="border border-neutral-800 rounded">
      <div className="px-4 py-3 text-xs opacity-70 border-b border-neutral-800">{title}</div>
      {rows.length === 0 ? (
        <div className="px-4 py-3 text-sm opacity-80">{empty}</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left opacity-70">
              <th className="px-4 py-2">Day</th>
              <th className="px-4 py-2">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-t border-neutral-800">
                <td className="px-4 py-2">{r.label}</td>
                <td className="px-4 py-2">
                  {r.amount.toLocaleString(undefined, { style: "currency", currency: "USD" })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
