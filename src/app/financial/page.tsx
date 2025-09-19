import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { getEffectiveTenant } from "@/lib/effective-tenant";

export const dynamic = "force-dynamic";

function monthRange(d: Date) {
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return { start, end };
}
function yearRange(d: Date) {
  const start = new Date(d.getFullYear(), 0, 1);
  const end = new Date(d.getFullYear() + 1, 0, 1);
  return { start, end };
}
const usd = (n: number) =>
  (Number(n) || 0).toLocaleString(undefined, { style: "currency", currency: "USD" });

/** Defensive sum over any[] to avoid TS friction with joins */
function sumRevenue(lines: any[]) {
  let qty = 0;
  let revenue = 0;
  for (const l of lines ?? []) {
    const q = Number(l?.qty ?? 0);
    const p = Number(l?.unit_price ?? 0);
    qty += q;
    revenue += q * p;
  }
  return { qty, revenue };
}

export default async function FinancialsPage() {
  const supabase = await createServerClient();
  const tenantId = await getEffectiveTenant(supabase);
  if (!tenantId) {
    return (
      <main className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Financials</h1>
        <p className="mt-2">Profile missing tenant.</p>
      </main>
    );
  }

  const now = new Date();
  const { start: mStart, end: mEnd } = monthRange(now);
  const { start: yStart, end: yEnd } = yearRange(now);

  // ---- SALES (MTD)
  const { data: mLines } = await supabase
    .from("sales_order_lines")
    .select("qty, unit_price, sales_orders!inner(occurred_at)")
    .eq("tenant_id", tenantId)
    .gte("sales_orders.occurred_at", mStart.toISOString())
    .lt("sales_orders.occurred_at", mEnd.toISOString());

  // ---- SALES (YTD)
  const { data: yLines } = await supabase
    .from("sales_order_lines")
    .select("qty, unit_price, sales_orders!inner(occurred_at)")
    .eq("tenant_id", tenantId)
    .gte("sales_orders.occurred_at", yStart.toISOString())
    .lt("sales_orders.occurred_at", yEnd.toISOString());

  const mSales = sumRevenue(mLines ?? []);
  const ySales = sumRevenue(yLines ?? []);

  // ---- EXPENSES (optional)
  let hasExpenses = true;
  let mExp = 0;
  let yExp = 0;
  try {
    const { data: mExpRows, error: mErr } = await supabase
      .from("expenses")
      .select("amount, occurred_at")
      .eq("tenant_id", tenantId)
      .gte("occurred_at", mStart.toISOString())
      .lt("occurred_at", mEnd.toISOString());
    if (mErr) throw mErr;
    mExp = (mExpRows ?? []).reduce((a: number, r: any) => a + Number(r?.amount ?? 0), 0);

    const { data: yExpRows, error: yErr } = await supabase
      .from("expenses")
      .select("amount, occurred_at")
      .eq("tenant_id", tenantId)
      .gte("occurred_at", yStart.toISOString())
      .lt("occurred_at", yEnd.toISOString());
    if (yErr) throw yErr;
    yExp = (yExpRows ?? []).reduce((a: number, r: any) => a + Number(r?.amount ?? 0), 0);
  } catch {
    hasExpenses = false;
  }

  const mPL = mSales.revenue - mExp;
  const yPL = ySales.revenue - yExp;

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Financials</h1>
        <div className="flex gap-2">
          <Link href="/sales" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
            Sales details
          </Link>
          <Link href="/expenses" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
            Expenses details
          </Link>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="border rounded-lg p-4">
          <div className="text-xs opacity-75">THIS MONTH — SALES</div>
          <div className="text-2xl font-semibold">{usd(mSales.revenue)}</div>
          <div className="text-xs opacity-75 mt-1">Qty based on line totals</div>
        </div>
        <div className="border rounded-lg p-4">
          <div className="text-xs opacity-75">THIS MONTH — EXPENSES</div>
          <div className="text-2xl font-semibold">
            {hasExpenses ? usd(mExp) : "$0.00"}
          </div>
          {!hasExpenses && (
            <div className="text-xs text-amber-300 mt-1">
              Expenses table not set up yet.
            </div>
          )}
        </div>
        <div className="border rounded-lg p-4">
          <div className="text-xs opacity-75">THIS MONTH — PROFIT / LOSS</div>
          <div className="text-2xl font-semibold">{usd(mPL)}</div>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="border rounded-lg p-4">
          <div className="text-xs opacity-75">YEAR TO DATE — SALES</div>
          <div className="text-2xl font-semibold">{usd(ySales.revenue)}</div>
        </div>
        <div className="border rounded-lg p-4">
          <div className="text-xs opacity-75">YEAR TO DATE — EXPENSES</div>
          <div className="text-2xl font-semibold">
            {hasExpenses ? usd(yExp) : "$0.00"}
          </div>
          {!hasExpenses && (
            <div className="text-xs text-amber-300 mt-1">
              Expenses table not set up yet.
            </div>
          )}
        </div>
        <div className="border rounded-lg p-4">
          <div className="text-xs opacity-75">YEAR TO DATE — PROFIT / LOSS</div>
          <div className="text-2xl font-semibold">{usd(yPL)}</div>
        </div>
      </div>
    </main>
  );
}
