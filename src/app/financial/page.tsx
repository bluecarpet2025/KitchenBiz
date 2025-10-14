import "server-only";
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { effectiveTenantId } from "@/lib/effective-tenant";

/* ------------------------------ formatting ------------------------------ */
const fmtUSD = (n: number) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(Number(n) || 0);

/* ------------------------------ date helpers ---------------------------- */
const pad2 = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
const ym = (d: Date) => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;

/* --------------------------------- page --------------------------------- */
export default async function FinancialPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[]>;
}) {
  // 👇 NOT a Promise — use directly
  const sp = searchParams ?? {};

  const supabase = await createServerClient();
  const { tenantId } = await effectiveTenantId(supabase);

  // default to current year
  const now = new Date();
  const startDefault = `${now.getUTCFullYear()}-01-01`;
  const endDefault = `${now.getUTCFullYear()}-12-31`;

  const start = (typeof sp.start === "string" && sp.start) || startDefault;
  const end = (typeof sp.end === "string" && sp.end) || endDefault;

  const thisMonth = ym(now);
  const thisYear = String(now.getUTCFullYear());

  async function sumOne(
    view: string,
    periodCol: "month" | "year",
    key: string,
    col: "revenue" | "total"
  ) {
    if (!tenantId) return 0;
    const { data } = await supabase
      .from(view)
      .select(col)
      .eq("tenant_id", tenantId)
      .eq(periodCol, key)
      .maybeSingle();
    return Number((data as any)?.[col] ?? 0);
  }

  const [mSales, mExp, ySales, yExp] = await Promise.all([
    sumOne("v_sales_month_totals", "month", thisMonth, "revenue"),
    sumOne("v_expense_month_totals", "month", thisMonth, "total"),
    sumOne("v_sales_year_totals", "year", thisYear, "revenue"),
    sumOne("v_expense_year_totals", "year", thisYear, "total"),
  ]);
  const mProfit = mSales - mExp;
  const yProfit = ySales - yExp;

  // YTD expense mix (from view)
  const { data: expenseMixRows } = await supabase
    .from("v_expense_category_totals_ytd")
    .select("category, total, tenant_id");
  const expenseMix =
    (expenseMixRows ?? [])
      .filter((r: any) => r.tenant_id === tenantId)
      .map((r: any) => ({ name: r.category as string, value: Number(r.total || 0) })) ?? [];

  // trailing 12 months
  const trailingKeys: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    trailingKeys.push(ym(d));
  }
  const trailing = await Promise.all(
    trailingKeys.map(async (key) => {
      const [{ data: s }, { data: e }] = await Promise.all([
        supabase.from("v_sales_month_totals").select("revenue").eq("tenant_id", tenantId).eq("month", key).maybeSingle(),
        supabase.from("v_expense_month_totals").select("total").eq("tenant_id", tenantId).eq("month", key).maybeSingle(),
      ]);
      const sales = Number((s as any)?.revenue ?? 0);
      const expenses = Number((e as any)?.total ?? 0);
      return { key, sales, expenses, profit: sales - expenses };
    })
  );

  // income statement rows inside filter window
  const startD = new Date(start + "T00:00:00Z");
  const endD = new Date(end + "T00:00:00Z");
  const months: string[] = [];
  {
    const cur = new Date(Date.UTC(startD.getUTCFullYear(), startD.getUTCMonth(), 1));
    while (cur <= endD) {
      months.push(ym(cur));
      cur.setUTCMonth(cur.getUTCMonth() + 1);
    }
  }

  const incomeRows = await Promise.all(
    months.map(async (key) => {
      const [s, e] = await Promise.all([
        supabase.from("v_sales_month_totals").select("revenue").eq("tenant_id", tenantId).eq("month", key).maybeSingle(),
        supabase.from("v_expense_month_totals").select("total").eq("tenant_id", tenantId).eq("month", key).maybeSingle(),
      ]);

      const monthStart = new Date(key + "-01T00:00:00Z");
      const monthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1));
      const { data: expRows } = await supabase
        .from("expenses")
        .select("category, amount_usd, occurred_at, tenant_id")
        .eq("tenant_id", tenantId)
        .gte("occurred_at", ymd(monthStart))
        .lt("occurred_at", ymd(monthEnd));

      let food = 0, labor = 0, rent = 0, utils = 0, mkt = 0, misc = 0;
      for (const r of (expRows ?? []) as any[]) {
        const cat = String(r.category ?? "").toLowerCase();
        const val = Number(r.amount_usd || 0);
        if (cat.includes("food")) food += val;
        else if (cat.includes("labor")) labor += val;
        else if (cat.includes("rent")) rent += val;
        else if (cat.includes("util")) utils += val;
        else if (cat.includes("market")) mkt += val;
        else misc += val;
      }

      const sales = Number((s.data as any)?.revenue ?? 0);
      const totalExp = Number((e.data as any)?.total ?? 0);
      return { month: key, sales, food, labor, rent, utilities: utils, marketing: mkt, misc, totalExp, profit: sales - totalExp };
    })
  );

  return (
    <main className="max-w-6xl mx-auto px-4 py-6">
      {/* controls */}
      <div className="flex items-end justify-between gap-3 mb-4">
        <div className="flex gap-3 items-center">
          <div>
            <div className="text-xs opacity-70">Start (UTC)</div>
            <input type="date" defaultValue={start} name="start" className="bg-neutral-900 border rounded px-2 py-1" />
          </div>
          <div>
            <div className="text-xs opacity-70">End (UTC)</div>
            <input type="date" defaultValue={end} name="end" className="bg-neutral-900 border rounded px-2 py-1" />
          </div>
          <a
            className="rounded border px-3 py-1 hover:bg-neutral-900 text-sm"
            href={`/financial?start=${start}&end=${end}`}
          >
            Apply
          </a>
        </div>

        <div className="flex gap-2">
          <Link href="/sales" className="rounded border px-3 py-1 hover:bg-neutral-900 text-sm">Sales details</Link>
          <Link href="/expenses" className="rounded border px-3 py-1 hover:bg-neutral-900 text-sm">Expenses details</Link>
          <a className="rounded border px-3 py-1 hover:bg-neutral-900 text-sm" href={`/api/accounting/export?label=${encodeURIComponent(`${start}_${end}`)}`}>
            Download Tax Pack
          </a>
        </div>
      </div>

      {/* headline tiles */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="border rounded p-4">
          <div className="text-xs opacity-60">THIS MONTH — SALES</div>
          <div className="text-2xl font-semibold">{fmtUSD(mSales)}</div>
        </div>
        <div className="border rounded p-4">
          <div className="text-xs opacity-60">THIS MONTH — EXPENSES</div>
          <div className="text-2xl font-semibold">{fmtUSD(mExp)}</div>
        </div>
        <div className="border rounded p-4">
          <div className="text-xs opacity-60">THIS MONTH — PROFIT / LOSS</div>
          <div className="text-2xl font-semibold">{fmtUSD(mProfit)}</div>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
        <div className="border rounded p-4">
          <div className="text-xs opacity-60">YEAR TO DATE — SALES</div>
          <div className="text-2xl font-semibold">{fmtUSD(ySales)}</div>
        </div>
        <div className="border rounded p-4">
          <div className="text-xs opacity-60">YEAR TO DATE — EXPENSES</div>
          <div className="text-2xl font-semibold">{fmtUSD(yExp)}</div>
        </div>
        <div className="border rounded p-4">
          <div className="text-xs opacity-60">YEAR TO DATE — PROFIT / LOSS</div>
          <div className="text-2xl font-semibold">{fmtUSD(yProfit)}</div>
        </div>
      </section>

      {/* charts (tabular fallback server-side) */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
        <div className="border rounded p-4">
          <div className="text-sm opacity-80 mb-2">Trailing months — Sales vs Expenses</div>
          <div className="mt-2 overflow-x-auto">
            <table className="text-sm w-full">
              <thead className="opacity-80">
                <tr>
                  <th className="text-left font-normal px-2 py-1">Month</th>
                  <th className="text-right font-normal px-2 py-1">Sales</th>
                  <th className="text-right font-normal px-2 py-1">Expenses</th>
                  <th className="text-right font-normal px-2 py-1">Profit</th>
                </tr>
              </thead>
              <tbody>
                {trailing.map(r => (
                  <tr key={r.key} className="border-t">
                    <td className="px-2 py-1">{r.key}</td>
                    <td className="px-2 py-1 text-right">{fmtUSD(r.sales)}</td>
                    <td className="px-2 py-1 text-right">{fmtUSD(r.expenses)}</td>
                    <td className={`px-2 py-1 text-right ${r.profit < 0 ? "text-rose-400" : ""}`}>{fmtUSD(r.profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="border rounded p-4">
          <div className="text-sm opacity-80 mb-2">YTD expense mix</div>
          <div className="overflow-x-auto">
            <table className="text-sm w-full">
              <tbody>
                {expenseMix.map((e) => (
                  <tr key={e.name} className="border-t">
                    <td className="px-2 py-1">{e.name}</td>
                    <td className="px-2 py-1 text-right">{fmtUSD(e.value)}</td>
                  </tr>
                ))}
                {expenseMix.length === 0 && (
                  <tr><td className="px-2 py-2 text-xs opacity-70">No expenses yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* income statement */}
      <section className="mt-6 border rounded">
        <div className="px-4 py-3 border-b text-sm opacity-80">Income Statement — by month</div>
        <div className="px-4 py-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="opacity-80">
              <tr>
                <th className="text-left font-normal px-2 py-1">Month</th>
                <th className="text-right font-normal px-2 py-1">Sales</th>
                <th className="text-right font-normal px-2 py-1">Food</th>
                <th className="text-right font-normal px-2 py-1">Labor</th>
                <th className="text-right font-normal px-2 py-1">Rent</th>
                <th className="text-right font-normal px-2 py-1">Utilities</th>
                <th className="text-right font-normal px-2 py-1">Marketing</th>
                <th className="text-right font-normal px-2 py-1">Misc</th>
                <th className="text-right font-normal px-2 py-1">Total Expenses</th>
                <th className="text-right font-normal px-2 py-1">Profit</th>
              </tr>
            </thead>
            <tbody>
              {incomeRows.map((r) => (
                <tr key={r.month} className="border-t">
                  <td className="px-2 py-1">{r.month}</td>
                  <td className="px-2 py-1 text-right">{fmtUSD(r.sales)}</td>
                  <td className="px-2 py-1 text-right">{fmtUSD(r.food)}</td>
                  <td className="px-2 py-1 text-right">{fmtUSD(r.labor)}</td>
                  <td className="px-2 py-1 text-right">{fmtUSD(r.rent)}</td>
                  <td className="px-2 py-1 text-right">{fmtUSD(r.utilities)}</td>
                  <td className="px-2 py-1 text-right">{fmtUSD(r.marketing)}</td>
                  <td className="px-2 py-1 text-right">{fmtUSD(r.misc)}</td>
                  <td className="px-2 py-1 text-right">{fmtUSD(r.totalExp)}</td>
                  <td className={`px-2 py-1 text-right ${r.profit < 0 ? "text-rose-400" : ""}`}>{fmtUSD(r.profit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
