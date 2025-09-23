// src/app/financial/page.tsx
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";

// Local, safe USD formatter (keeps you from needing any other import)
const fmtUSD = (n: number) => n.toLocaleString(undefined, { style: "currency", currency: "USD" });

// Date helpers
const todayStr = (): string => {
  const d = new Date();
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};
const monthStr = (): string => {
  const d = new Date();
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
};
const yearStr = (): string => String(new Date().getFullYear());

// Small query helpers (column defaults to "total" but we can pass "revenue" for sales)
async function sumOne(
  supabase: any,
  view: string,
  byCol: "day" | "week" | "month" | "year",
  period: string,
  tenantId: string,
  valueCol: "total" | "revenue" = "total"
): Promise<number> {
  if (!period) return 0;
  const { data } = await supabase
    .from(view)
    .select(`${valueCol}`)
    .eq("tenant_id", tenantId)
    .eq(byCol, period)
    .maybeSingle();
  const n = (data?.[valueCol] ?? 0) as number;
  return Number(n) || 0;
}

export default async function FinancialPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Find tenant id (use profiles table like the rest of the app)
  let tenantId = "";
  if (user) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", user.id)
      .maybeSingle();
    tenantId = prof?.tenant_id ?? "";
  }

  const thisMonth = monthStr();
  const thisYear = yearStr();

  // Sales use "revenue"; Expenses use "total"
  const [salesMonth, salesYtd, expenseMonth, expenseYtd] = await Promise.all([
    sumOne(supabase, "v_sales_month_totals", "month", thisMonth, tenantId, "revenue"),
    sumOne(supabase, "v_sales_year_totals", "year", thisYear, tenantId, "revenue"),
    sumOne(supabase, "v_expense_month_totals", "month", thisMonth, tenantId, "total"),
    sumOne(supabase, "v_expense_year_totals", "year", thisYear, tenantId, "total"),
  ]);

  const profitThisMonth = salesMonth - expenseMonth;
  const profitYtd = salesYtd - expenseYtd;

  return (
    <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      <div className="flex gap-3">
        <Link href="/sales" className="px-3 py-2 border rounded text-sm hover:bg-neutral-900">
          Sales details
        </Link>
        <Link href="/expenses" className="px-3 py-2 border rounded text-sm hover:bg-neutral-900">
          Expenses details
        </Link>
      </div>

      <section className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* THIS MONTH — SALES */}
        <div className="border rounded p-5">
          <div className="text-xs uppercase opacity-70 mb-2">This month — Sales</div>
          <div className="text-2xl font-semibold">{fmtUSD(salesMonth)}</div>
        </div>

        {/* THIS MONTH — EXPENSES */}
        <div className="border rounded p-5">
          <div className="text-xs uppercase opacity-70 mb-2">This month — Expenses</div>
          <div className="text-2xl font-semibold">{fmtUSD(expenseMonth)}</div>
        </div>

        {/* THIS MONTH — PROFIT / LOSS */}
        <div className="border rounded p-5">
          <div className="text-xs uppercase opacity-70 mb-2">This month — Profit / Loss</div>
          <div className={`text-2xl font-semibold ${profitThisMonth < 0 ? "text-rose-400" : ""}`}>
            {fmtUSD(profitThisMonth)}
          </div>
        </div>

        {/* YTD — SALES */}
        <div className="border rounded p-5">
          <div className="text-xs uppercase opacity-70 mb-2">Year to date — Sales</div>
          <div className="text-2xl font-semibold">{fmtUSD(salesYtd)}</div>
        </div>

        {/* YTD — EXPENSES */}
        <div className="border rounded p-5">
          <div className="text-xs uppercase opacity-70 mb-2">Year to date — Expenses</div>
          <div className="text-2xl font-semibold">{fmtUSD(expenseYtd)}</div>
        </div>

        {/* YTD — PROFIT / LOSS */}
        <div className="border rounded p-5">
          <div className="text-xs uppercase opacity-70 mb-2">Year to date — Profit / Loss</div>
          <div className={`text-2xl font-semibold ${profitYtd < 0 ? "text-rose-400" : ""}`}>
            {fmtUSD(profitYtd)}
          </div>
        </div>
      </section>
    </main>
  );
}
