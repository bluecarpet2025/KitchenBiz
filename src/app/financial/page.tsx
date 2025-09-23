// src/app/financial/page.tsx
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { getEffectiveTenant } from "@/lib/effective-tenant";
import { fmtUSD } from "@/lib/costing";

export const dynamic = "force-dynamic";

type SalesMonth = { month: string; orders: number; qty: number; revenue: number };
type SalesYear  = { year: string;  orders: number; qty: number; revenue: number };
type ExpMonth   = { month: string; entries: number; total: number };
type ExpYear    = { year: string;  entries: number; total: number };

export default async function FinancialsPage() {
  const supabase = await createServerClient();
  const tenantId = await getEffectiveTenant(supabase);

  const pick = <T,>(r: { data: T[] | null; error: any }) => (r.data ?? []) as T[];

  const salesM = pick<SalesMonth>(
    await supabase.from("v_sales_month_totals")
      .select("month,orders,qty,revenue")
      .eq("tenant_id", tenantId)
      .order("month", { ascending: false })
      .limit(1)
  );
  const salesY = pick<SalesYear>(
    await supabase.from("v_sales_year_totals")
      .select("year,orders,qty,revenue")
      .eq("tenant_id", tenantId)
      .order("year", { ascending: false })
      .limit(1)
  );

  const expM = pick<ExpMonth>(
    await supabase.from("v_expense_month_totals")
      .select("month,entries,total")
      .eq("tenant_id", tenantId)
      .order("month", { ascending: false })
      .limit(1)
  );
  const expY = pick<ExpYear>(
    await supabase.from("v_expense_year_totals")
      .select("year,entries,total")
      .eq("tenant_id", tenantId)
      .order("year", { ascending: false })
      .limit(1)
  );

  const monthSales = salesM[0]?.revenue ?? 0;
  const monthExp   = expM[0]?.total ?? 0;
  const ytdSales   = salesY[0]?.revenue ?? 0;
  const ytdExp     = expY[0]?.total ?? 0;

  const Card = ({ title, body, foot }: { title: string; body: string; foot?: string }) => (
    <div className="border rounded-lg p-4">
      <div className="text-xs opacity-70 mb-1">{title}</div>
      <div className="text-2xl font-semibold">{body}</div>
      {foot && <div className="mt-2 text-xs opacity-60">{foot}</div>}
    </div>
  );

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Financials</h1>
        <div className="flex gap-2">
          <Link href="/sales" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">Sales details</Link>
          <Link href="/expenses" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">Expenses details</Link>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card
          title="THIS MONTH — SALES"
          body={fmtUSD(monthSales)}
          foot={salesM[0] ? `Qty based on line totals` : undefined}
        />
        <Card
          title="THIS MONTH — EXPENSES"
          body={fmtUSD(monthExp)}
          foot={!expM[0] ? "Expenses table not set up yet." : undefined}
        />
        <Card
          title="THIS MONTH — PROFIT / LOSS"
          body={fmtUSD(monthSales - monthExp)}
        />
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card
          title="YEAR TO DATE — SALES"
          body={fmtUSD(ytdSales)}
        />
        <Card
          title="YEAR TO DATE — EXPENSES"
          body={fmtUSD(ytdExp)}
          foot={!expY[0] ? "Expenses table not set up yet." : undefined}
        />
        <Card
          title="YEAR TO DATE — PROFIT / LOSS"
          body={fmtUSD(ytdSales - ytdExp)}
        />
      </div>
    </main>
  );
}
