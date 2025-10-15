import "server-only";
import { createServerClient } from "@/lib/supabase/server";
import { effectiveTenantId } from "@/lib/effective-tenant";
import Link from "next/link";

const fmtUSD = (n: number) =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(Number(n) || 0);

export default async function FinancialPage() {
  const supabase = await createServerClient();

  // 🔹 Updated to use new helper signature (no args)
  const { tenantId, useDemo } = await effectiveTenantId();

  if (!tenantId) {
    return (
      <main className="max-w-4xl mx-auto p-6">
        <div className="rounded border p-4 text-sm">
          No tenant found. Please sign in or create your profile first.
        </div>
      </main>
    );
  }

  // default to current year
  const now = new Date();
  const year = now.getUTCFullYear();

  // Fetch yearly totals from views (v_sales_year_totals / v_expense_year_totals)
  const { data: salesData } = await supabase
    .from("v_sales_year_totals")
    .select("year, revenue, orders, tenant_id")
    .eq("tenant_id", tenantId)
    .eq("year", year)
    .maybeSingle();

  const { data: expenseData } = await supabase
    .from("v_expense_year_totals")
    .select("year, total, tenant_id")
    .eq("tenant_id", tenantId)
    .eq("year", year)
    .maybeSingle();

  const sales = Number((salesData as any)?.revenue || 0);
  const expenses = Number((expenseData as any)?.total || 0);
  const profit = sales - expenses;
  const orders = Number((salesData as any)?.orders || 0);
  const aov = orders > 0 ? sales / orders : 0;

  return (
    <main className="max-w-5xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold">Income Statement · {year}</h1>
        <div className="flex gap-2">
          <Link
            href="/sales"
            className="rounded border px-3 py-1 hover:bg-neutral-900 text-sm"
          >
            Sales details
          </Link>
          <Link
            href="/expenses"
            className="rounded border px-3 py-1 hover:bg-neutral-900 text-sm"
          >
            Expenses details
          </Link>
        </div>
      </div>

      {useDemo && (
        <div className="mb-4 rounded border border-emerald-700 bg-neutral-900/40 px-3 py-2 text-sm">
          Demo mode is <b>read-only</b>. To add or edit financial data, disable
          “Use demo data” in your profile.
        </div>
      )}

      <section className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
        <div className="border rounded p-4">
          <div className="text-sm opacity-80">TOTAL SALES</div>
          <div className="text-2xl font-semibold">{fmtUSD(sales)}</div>
        </div>
        <div className="border rounded p-4">
          <div className="text-sm opacity-80">TOTAL EXPENSES</div>
          <div className="text-2xl font-semibold">{fmtUSD(expenses)}</div>
        </div>
        <div className="border rounded p-4">
          <div className="text-sm opacity-80">PROFIT / LOSS</div>
          <div
            className={`text-2xl font-semibold ${
              profit < 0 ? "text-rose-400" : "text-emerald-400"
            }`}
          >
            {fmtUSD(profit)}
          </div>
        </div>
        <div className="border rounded p-4">
          <div className="text-sm opacity-80">AOV (Average Order Value)</div>
          <div className="text-2xl font-semibold">{fmtUSD(aov)}</div>
          <div className="text-xs opacity-70 mt-1">{orders} orders</div>
        </div>
      </section>

      <section className="border rounded p-4">
        <h2 className="text-sm opacity-80 mb-2">Summary</h2>
        <table className="w-full text-sm">
          <thead className="opacity-80 border-b">
            <tr>
              <th className="text-left px-2 py-1 font-normal">Metric</th>
              <th className="text-right px-2 py-1 font-normal">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="px-2 py-1">Total Sales</td>
              <td className="px-2 py-1 text-right">{fmtUSD(sales)}</td>
            </tr>
            <tr>
              <td className="px-2 py-1">Total Expenses</td>
              <td className="px-2 py-1 text-right">{fmtUSD(expenses)}</td>
            </tr>
            <tr>
              <td className="px-2 py-1 font-semibold">Profit / Loss</td>
              <td
                className={`px-2 py-1 text-right font-semibold ${
                  profit < 0 ? "text-rose-400" : "text-emerald-400"
                }`}
              >
                {fmtUSD(profit)}
              </td>
            </tr>
            <tr>
              <td className="px-2 py-1">Orders</td>
              <td className="px-2 py-1 text-right">{orders}</td>
            </tr>
            <tr>
              <td className="px-2 py-1">Average Order Value</td>
              <td className="px-2 py-1 text-right">{fmtUSD(aov)}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </main>
  );
}
