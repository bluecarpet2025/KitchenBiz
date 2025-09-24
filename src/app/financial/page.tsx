import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";

const fmtUSD = (n: number) =>
  (n || 0).toLocaleString(undefined, { style: "currency", currency: "USD" });

function pad(n: number) { return n.toString().padStart(2, "0"); }
function monthStr(d = new Date()) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}
function yearStr(d = new Date()) {
  return `${d.getUTCFullYear()}`;
}

async function sumOne(
  supabase: any,
  view: string,
  periodCol: "month" | "year",
  key: string,
  tenantId: string | null,
  valueCol: "revenue" | "total"
): Promise<number> {
  if (!tenantId) return 0;
  const { data } = await supabase
    .from(view)
    .select(valueCol)
    .eq("tenant_id", tenantId)
    .eq(periodCol, key)
    .maybeSingle();
  return Number(data?.[valueCol] ?? 0);
}

export default async function FinancialPage() {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let tenantId: string | null = null;
  if (user) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("tenant_id, display_name")
      .eq("id", user.id)
      .maybeSingle();
    tenantId = (prof?.tenant_id as string | null) ?? null;
  }

  const thisMonth = monthStr();
  const thisYear = yearStr();

  const [salesMonth, salesYTD] = await Promise.all([
    sumOne(supabase, "v_sales_month_totals", "month", thisMonth, tenantId, "revenue"),
    sumOne(supabase, "v_sales_year_totals", "year", thisYear, tenantId, "revenue"),
  ]);

  const [expMonth, expYTD] = await Promise.all([
    sumOne(supabase, "v_expense_month_totals", "month", thisMonth, tenantId, "total"),
    sumOne(supabase, "v_expense_year_totals", "year", thisYear, tenantId, "total"),
  ]);

  const profitMonth = salesMonth - expMonth;
  const profitYTD = salesYTD - expYTD;

  return (
    <main className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Financials</h1>
        <div className="flex gap-2">
          <Link href="/sales" className="rounded border px-3 py-1 hover:bg-neutral-900 text-sm">
            Sales details
          </Link>
          <Link href="/expenses" className="rounded border px-3 py-1 hover:bg-neutral-900 text-sm">
            Expenses details
          </Link>
        </div>
      </div>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="border rounded p-4">
          <div className="text-sm opacity-80">THIS MONTH — SALES</div>
          <div className="text-2xl font-semibold">{fmtUSD(salesMonth)}</div>
        </div>
        <div className="border rounded p-4">
          <div className="text-sm opacity-80">THIS MONTH — EXPENSES</div>
          <div className="text-2xl font-semibold">{fmtUSD(expMonth)}</div>
        </div>
        <div className="border rounded p-4">
          <div className="text-sm opacity-80">THIS MONTH — PROFIT / LOSS</div>
          <div className={`text-2xl font-semibold ${profitMonth < 0 ? "text-rose-400" : ""}`}>
            {fmtUSD(profitMonth)}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
        <div className="border rounded p-4">
          <div className="text-sm opacity-80">YEAR TO DATE — SALES</div>
          <div className="text-2xl font-semibold">{fmtUSD(salesYTD)}</div>
        </div>
        <div className="border rounded p-4">
          <div className="text-sm opacity-80">YEAR TO DATE — EXPENSES</div>
          <div className="text-2xl font-semibold">{fmtUSD(expYTD)}</div>
        </div>
        <div className="border rounded p-4">
          <div className="text-sm opacity-80">YEAR TO DATE — PROFIT / LOSS</div>
          <div className={`text-2xl font-semibold ${profitYTD < 0 ? "text-rose-400" : ""}`}>
            {fmtUSD(profitYTD)}
          </div>
        </div>
      </section>
    </main>
  );
}
