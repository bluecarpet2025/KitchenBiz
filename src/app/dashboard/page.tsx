// src/app/dashboard/page.tsx
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";

// Local USD formatter
const fmtUSD = (n: number) => n.toLocaleString(undefined, { style: "currency", currency: "USD" });

// Date helpers
const dateToISO = (d: Date): string => {
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};
const todayStr = (): string => dateToISO(new Date());
const weekStr = (d = new Date()): string => {
  // ISO week string like 2025-W38
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  // Thursday in current week decides the year.
  tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
};
const monthStr = (): string => {
  const d = new Date();
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
};
const yearStr = (): string => String(new Date().getFullYear());
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

// Query helpers with column override (sales use "revenue")
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

async function daySeries(
  supabase: any,
  view: string,
  tenantId: string,
  sinceISO: string,
  valueCol: "total" | "revenue" = "total"
): Promise<Array<{ day: string; amount: number }>> {
  const { data } = await supabase
    .from(view)
    .select(`day, ${valueCol}`)
    .eq("tenant_id", tenantId)
    .gte("day", sinceISO)
    .order("day", { ascending: true });

  return (data ?? []).map((r: any) => ({
    day: r.day,
    amount: Number(r[valueCol] ?? 0) || 0,
  }));
}

export default async function DashboardPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // tenant id
  let tenantId = "";
  if (user) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", user.id)
      .maybeSingle();
    tenantId = prof?.tenant_id ?? "";
  }

  const today = todayStr();
  const thisWeek = weekStr();
  const thisMonth = monthStr();
  const thisYear = yearStr();
  const last7Start = dateToISO(addDays(new Date(), -6)); // <-- fixed

  // SALES: use "revenue"
  const [salesToday, salesWeek, salesMonth, salesYTD] = await Promise.all([
    sumOne(supabase, "v_sales_day_totals", "day", today, tenantId, "revenue"),
    sumOne(supabase, "v_sales_week_totals", "week", thisWeek, tenantId, "revenue"),
    sumOne(supabase, "v_sales_month_totals", "month", thisMonth, tenantId, "revenue"),
    sumOne(supabase, "v_sales_year_totals", "year", thisYear, tenantId, "revenue"),
  ]);

  // EXPENSES: use "total"
  const [expToday, expWeek, expMonth, expYTD] = await Promise.all([
    sumOne(supabase, "v_expense_day_totals", "day", today, tenantId, "total"),
    sumOne(supabase, "v_expense_week_totals", "week", thisWeek, tenantId, "total"),
    sumOne(supabase, "v_expense_month_totals", "month", thisMonth, tenantId, "total"),
    sumOne(supabase, "v_expense_year_totals", "year", thisYear, tenantId, "total"),
  ]);

  const profitThisMonth = salesMonth - expMonth;
  const profitYTD = salesYTD - expYTD;

  const [sales7, expenses7] = await Promise.all([
    daySeries(supabase, "v_sales_day_totals", tenantId, last7Start, "revenue"),
    daySeries(supabase, "v_expense_day_totals", tenantId, last7Start, "total"),
  ]);

  return (
    <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
      <div className="flex gap-3">
        <Link href="/sales/import" className="px-3 py-2 border rounded text-sm hover:bg-neutral-900">
          Import Sales CSV
        </Link>
        <Link href="/expenses/import" className="px-3 py-2 border rounded text-sm hover:bg-neutral-900">
          Import Expenses CSV
        </Link>
      </div>

      <section className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="border rounded p-5">
          <div className="text-xs uppercase opacity-70 mb-2">Today — Sales</div>
          <div className="text-2xl font-semibold">{fmtUSD(salesToday)}</div>
        </div>
        <div className="border rounded p-5">
          <div className="text-xs uppercase opacity-70 mb-2">This week — Sales</div>
          <div className="text-2xl font-semibold">{fmtUSD(salesWeek)}</div>
        </div>
        <div className="border rounded p-5">
          <div className="text-xs uppercase opacity-70 mb-2">This month — Sales</div>
          <div className="text-2xl font-semibold">{fmtUSD(salesMonth)}</div>
        </div>
        <div className="border rounded p-5">
          <div className="text-xs uppercase opacity-70 mb-2">YTD — Sales</div>
          <div className="text-2xl font-semibold">{fmtUSD(salesYTD)}</div>
        </div>

        <div className="border rounded p-5">
          <div className="text-xs uppercase opacity-70 mb-2">Today — Expenses</div>
          <div className="text-2xl font-semibold">{fmtUSD(expToday)}</div>
        </div>
        <div className="border rounded p-5">
          <div className="text-xs uppercase opacity-70 mb-2">This week — Expenses</div>
          <div className="text-2xl font-semibold">{fmtUSD(expWeek)}</div>
        </div>
        <div className="border rounded p-5">
          <div className="text-xs uppercase opacity-70 mb-2">This month — Expenses</div>
          <div className="text-2xl font-semibold">{fmtUSD(expMonth)}</div>
        </div>
        <div className="border rounded p-5">
          <div className="text-xs uppercase opacity-70 mb-2">YTD — Expenses</div>
          <div className="text-2xl font-semibold">{fmtUSD(expYTD)}</div>
        </div>
      </section>

      <section className="grid md:grid-cols-2 gap-6">
        <div className="border rounded p-5">
          <div className="text-xs uppercase opacity-70 mb-2">This month — Profit / Loss</div>
          <div className={`text-2xl font-semibold ${profitThisMonth < 0 ? "text-rose-400" : ""}`}>
            {fmtUSD(profitThisMonth)}
          </div>
        </div>
        <div className="border rounded p-5">
          <div className="text-xs uppercase opacity-70 mb-2">YTD — Profit / Loss</div>
          <div className={`text-2xl font-semibold ${profitYTD < 0 ? "text-rose-400" : ""}`}>
            {fmtUSD(profitYTD)}
          </div>
        </div>
      </section>

      <section className="grid md:grid-cols-2 gap-6">
        <div className="border rounded p-5">
          <div className="text-sm font-medium mb-3">Last 7 days — Sales</div>
          <div className="text-sm">
            {sales7.length === 0 ? (
              <div className="opacity-70">No sales in the last 7 days.</div>
            ) : (
              <div className="divide-y divide-neutral-800">
                {sales7.map((r) => (
                  <div key={r.day} className="flex justify-between py-1">
                    <span className="opacity-80">{r.day}</span>
                    <span>{fmtUSD(r.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="border rounded p-5">
          <div className="text-sm font-medium mb-3">Last 7 days — Expenses</div>
          <div className="text-sm">
            {expenses7.length === 0 ? (
              <div className="opacity-70">No expenses in the last 7 days.</div>
            ) : (
              <div className="divide-y divide-neutral-800">
                {expenses7.map((r) => (
                  <div key={r.day} className="flex justify-between py-1">
                    <span className="opacity-80">{r.day}</span>
                    <span>{fmtUSD(r.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="flex gap-3">
        <Link href="/sales" className="px-3 py-2 border rounded text-sm hover:bg-neutral-900">
          Sales details
        </Link>
        <Link href="/expenses" className="px-3 py-2 border rounded text-sm hover:bg-neutral-900">
          Expenses details
        </Link>
      </div>
    </main>
  );
}
