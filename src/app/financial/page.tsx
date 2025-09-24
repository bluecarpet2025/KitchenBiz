// src/app/financial/page.tsx
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { sumOne, todayStr, monthStr, yearStr } from "@/lib/db";

const fmtUSD = (n: number) =>
  n.toLocaleString(undefined, { style: "currency", currency: "USD" });

export const dynamic = "force-dynamic";

export default async function FinancialPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return <div className="p-6">Please sign in.</div>;

  const { data: prof } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  const tenantId = prof?.tenant_id ?? "";

  const now = new Date();
  const thisMonth = monthStr(now);
  const thisYear = yearStr(now);

  // Sales = revenue
  const salesThisMonth = await sumOne(
    supabase,
    "v_sales_month_totals",
    "month",
    thisMonth,
    tenantId,
    "revenue"
  );
  const salesYTD = await sumOne(
    supabase,
    "v_sales_year_totals",
    "year",
    thisYear,
    tenantId,
    "revenue"
  );

  // Expenses = total
  const expThisMonth = await sumOne(
    supabase,
    "v_expense_month_totals",
    "month",
    thisMonth,
    tenantId,
    "total"
  );
  const expYTD = await sumOne(
    supabase,
    "v_expense_year_totals",
    "year",
    thisYear,
    tenantId,
    "total"
  );

  const profitThisMonth = salesThisMonth - expThisMonth;
  const profitYTD = salesYTD - expYTD;

  return (
    <div className="p-6 space-y-6">
      <div className="flex gap-3">
        <Link href="/sales" className="rounded border px-3 py-2 hover:bg-neutral-900">
          Sales details
        </Link>
        <Link href="/expenses" className="rounded border px-3 py-2 hover:bg-neutral-900">
          Expenses details
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="THIS MONTH — SALES" value={fmtUSD(salesThisMonth)} />
        <Card title="THIS MONTH — EXPENSES" value={fmtUSD(expThisMonth)} />
        <Card
          title="THIS MONTH — PROFIT / LOSS"
          value={fmtUSD(profitThisMonth)}
          red={profitThisMonth < 0}
        />
        <Card title="YEAR TO DATE — SALES" value={fmtUSD(salesYTD)} />
        <Card title="YEAR TO DATE — EXPENSES" value={fmtUSD(expYTD)} />
        <Card
          title="YEAR TO DATE — PROFIT / LOSS"
          value={fmtUSD(profitYTD)}
          red={profitYTD < 0}
        />
      </div>
    </div>
  );
}

function Card({ title, value, red }: { title: string; value: string; red?: boolean }) {
  return (
    <div className="rounded border border-neutral-800 p-5">
      <div className="text-xs uppercase tracking-wide text-neutral-400">{title}</div>
      <div className={`mt-2 text-3xl font-semibold ${red ? "text-rose-400" : ""}`}>{value}</div>
    </div>
  );
}
