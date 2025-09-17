import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { getEffectiveTenant } from "@/lib/effective-tenant";
import { fmtUSD } from "@/lib/costing";

export const dynamic = "force-dynamic";

type SalesDay = {
  day: string;          // ISO date
  orders: number | null;
  qty: number | null;
  revenue: number | null;
};

type ExpenseRow = {
  occurred_at: string | null; // ISO date/time
  amount_usd: number | null;
};

function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function startOfYear(d = new Date()) {
  return new Date(d.getFullYear(), 0, 1);
}
function isOnOrAfter(a: Date, b: Date) { return a.getTime() >= b.getTime(); }

export default async function FinancialPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return (
      <main className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Financials</h1>
        <p className="mt-4">Sign in required.</p>
        <Link className="underline" href="/login?redirect=/financial">Go to login</Link>
      </main>
    );
  }

  const tenantId = await getEffectiveTenant(supabase);
  if (!tenantId) {
    return (
      <main className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Financials</h1>
        <p className="mt-4">Profile missing tenant.</p>
      </main>
    );
  }

  // --- SALES (v_sales_totals gives daily aggregates) ---
  let sales: SalesDay[] = [];
  {
    const { data } = await supabase
      .from("v_sales_totals")
      .select("day,orders,qty,revenue")
      .order("day", { ascending: true });
    sales = (data ?? []) as SalesDay[];
  }

  const today = new Date();
  const m0 = startOfMonth(today);
  const y0 = startOfYear(today);

  let monthOrders = 0, monthQty = 0, monthRevenue = 0;
  let ytdOrders = 0, ytdQty = 0, ytdRevenue = 0;

  for (const r of sales) {
    const d = r.day ? new Date(r.day) : null;
    if (!d) continue;

    if (isOnOrAfter(d, m0)) {
      monthOrders += Number(r.orders ?? 0);
      monthQty += Number(r.qty ?? 0);
      monthRevenue += Number(r.revenue ?? 0);
    }
    if (isOnOrAfter(d, y0)) {
      ytdOrders += Number(r.orders ?? 0);
      ytdQty += Number(r.qty ?? 0);
      ytdRevenue += Number(r.revenue ?? 0);
    }
  }

  // --- EXPENSES (optional; if table not present, totals = 0) ---
  // Expected future schema: public.expenses(tenant_id, occurred_at, amount_usd, note, category, ...)
  let monthExpenses = 0, ytdExpenses = 0;
  let expensesAvailable = true;
  {
    const { data: expenses, error } = await supabase
      .from("expenses")
      .select("occurred_at,amount_usd")
      .eq("tenant_id", tenantId);

    if (error) {
      expensesAvailable = false;
    } else {
      (expenses as ExpenseRow[] ?? []).forEach((e) => {
        const d = e.occurred_at ? new Date(e.occurred_at) : null;
        const amt = Number(e.amount_usd ?? 0);
        if (!d || !Number.isFinite(amt)) return;
        if (isOnOrAfter(d, m0)) monthExpenses += amt;
        if (isOnOrAfter(d, y0)) ytdExpenses += amt;
      });
    }
  }

  const monthPL = monthRevenue - monthExpenses;
  const ytdPL = ytdRevenue - ytdExpenses;

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Financials</h1>
        <div className="flex gap-2">
          <Link
            href="/sales"
            className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
          >
            Sales details
          </Link>
          <Link
            href="/expenses"
            className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
          >
            Expenses details
          </Link>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid md:grid-cols-3 gap-3">
        <div className="border rounded-lg p-3">
          <div className="text-xs opacity-75">THIS MONTH — SALES</div>
          <div className="text-xl font-semibold">{fmtUSD(monthRevenue)}</div>
          <div className="text-xs opacity-70 mt-1">
            Orders {monthOrders} • Qty {monthQty}
          </div>
        </div>

        <div className="border rounded-lg p-3">
          <div className="text-xs opacity-75">THIS MONTH — EXPENSES</div>
          <div className="text-xl font-semibold">{fmtUSD(monthExpenses)}</div>
          {!expensesAvailable && (
            <div className="text-xs text-amber-300 mt-1">
              Expenses table not set up yet.
            </div>
          )}
        </div>

        <div className="border rounded-lg p-3">
          <div className="text-xs opacity-75">THIS MONTH — PROFIT / LOSS</div>
          <div className="text-xl font-semibold">{fmtUSD(monthPL)}</div>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <div className="border rounded-lg p-3">
          <div className="text-xs opacity-75">YEAR TO DATE — SALES</div>
          <div className="text-xl font-semibold">{fmtUSD(ytdRevenue)}</div>
          <div className="text-xs opacity-70 mt-1">
            Orders {ytdOrders} • Qty {ytdQty}
          </div>
        </div>

        <div className="border rounded-lg p-3">
          <div className="text-xs opacity-75">YEAR TO DATE — EXPENSES</div>
          <div className="text-xl font-semibold">{fmtUSD(ytdExpenses)}</div>
          {!expensesAvailable && (
            <div className="text-xs text-amber-300 mt-1">
              Expenses table not set up yet.
            </div>
          )}
        </div>

        <div className="border rounded-lg p-3">
          <div className="text-xs opacity-75">YEAR TO DATE — PROFIT / LOSS</div>
          <div className="text-xl font-semibold">{fmtUSD(ytdPL)}</div>
        </div>
      </div>
    </main>
  );
}
