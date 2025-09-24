// src/app/financial/page.tsx
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { todayStr, monthStr, yearStr } from "@/lib/dates";
import { fmtUSD } from "@/lib/format";

type Num = number | string | null | undefined;
const asNum = (v: Num) => (v === null || v === undefined ? 0 : Number(v));

export const dynamic = "force-dynamic";

export default async function FinancialPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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

  // Helpers that read a single row from our views
  async function sumOne(
    view: string,
    periodField: "day" | "week" | "month" | "year",
    periodValue: string,
    field: "revenue" | "total"
  ) {
    const { data } = await supabase
      .from(view)
      .select(field)
      .eq("tenant_id", tenantId)
      .eq(periodField, periodValue)
      .maybeSingle();
    return asNum(data?.[field as keyof typeof data]);
  }

  // SALES use `revenue`
  const salesMonth = await sumOne(
    "v_sales_month_totals",
    "month",
    thisMonth,
    "revenue"
  );
  const salesYTD = await sumOne(
    "v_sales_year_totals",
    "year",
    thisYear,
    "revenue"
  );

  // EXPENSES use `total`
  const expMonth = await sumOne(
    "v_expense_month_totals",
    "month",
    thisMonth,
    "total"
  );
  const expYTD = await sumOne(
    "v_expense_year_totals",
    "year",
    thisYear,
    "total"
  );

  const profitMonth = salesMonth - expMonth;
  const profitYTD = salesYTD - expYTD;

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <div className="flex gap-3">
        <Link href="/sales" className="btn">Sales details</Link>
        <Link href="/expenses" className="btn">Expenses details</Link>
      </div>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card">
          <div className="card-title">THIS MONTH — SALES</div>
          <div className="card-big">{fmtUSD(salesMonth)}</div>
        </div>

        <div className="card">
          <div className="card-title">THIS MONTH — EXPENSES</div>
          <div className="card-big">{fmtUSD(expMonth)}</div>
        </div>

        <div className="card">
          <div className="card-title">THIS MONTH — PROFIT / LOSS</div>
          <div className="card-big text-rose-400">{fmtUSD(profitMonth)}</div>
        </div>

        <div className="card">
          <div className="card-title">YEAR TO DATE — SALES</div>
          <div className="card-big">{fmtUSD(salesYTD)}</div>
        </div>

        <div className="card">
          <div className="card-title">YEAR TO DATE — EXPENSES</div>
          <div className="card-big">{fmtUSD(expYTD)}</div>
        </div>

        <div className="card">
          <div className="card-title">YEAR TO DATE — PROFIT / LOSS</div>
          <div className="card-big text-rose-400">{fmtUSD(profitYTD)}</div>
        </div>
      </section>
    </main>
  );
}
