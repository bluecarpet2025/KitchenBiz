// src/app/dashboard/page.tsx
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { todayStr, weekStr, monthStr, yearStr, addDays } from "@/lib/dates";
import { fmtUSD } from "@/lib/format";

type Num = number | string | null | undefined;
const asNum = (v: Num) => (v === null || v === undefined ? 0 : Number(v));

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
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

  const today = todayStr();
  const thisWeek = weekStr();
  const thisMonth = monthStr();
  const thisYear = yearStr();

  const last7Start = todayStr(addDays(new Date(), -6));

  // Reusable helpers
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

  async function daySeries(
    view: string,
    field: "revenue" | "total",
    startDayISO: string
  ) {
    const { data } = await supabase
      .from(view)
      .select(`day, ${field}`)
      .eq("tenant_id", tenantId)
      .gte("day", startDayISO)
      .order("day", { ascending: true });

    return (data ?? []).map((r: any) => ({
      day: r.day,
      amount: asNum(r[field]),
    }));
  }

  // SALES: read from *_sales_* views using field `revenue`
  const [salesToday, salesWeek, salesMonth, salesYTD] = await Promise.all([
    sumOne("v_sales_day_totals", "day", today, "revenue"),
    sumOne("v_sales_week_totals", "week", thisWeek, "revenue"),
    sumOne("v_sales_month_totals", "month", thisMonth, "revenue"),
    sumOne("v_sales_year_totals", "year", thisYear, "revenue"),
  ]);

  // EXPENSES: read from *_expense_* views using field `total`
  const [expToday, expWeek, expMonth, expYTD] = await Promise.all([
    sumOne("v_expense_day_totals", "day", today, "total"),
    sumOne("v_expense_week_totals", "week", thisWeek, "total"),
    sumOne("v_expense_month_totals", "month", thisMonth, "total"),
    sumOne("v_expense_year_totals", "year", thisYear, "total"),
  ]);

  const profitThisMonth = salesMonth - expMonth;
  const profitYTD = salesYTD - expYTD;

  const [sales7, exp7] = await Promise.all([
    daySeries("v_sales_day_totals", "revenue", last7Start),
    daySeries("v_expense_day_totals", "total", last7Start),
  ]);

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <div className="flex gap-3">
        <Link href="/sales/import" className="btn">Import Sales CSV</Link>
        <Link href="/expenses/import" className="btn">Import Expenses CSV</Link>
      </div>

      <section className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="card">
          <div className="card-title">TODAY — SALES</div>
          <div className="card-big">{fmtUSD(salesToday)}</div>
        </div>
        <div className="card">
          <div className="card-title">THIS WEEK — SALES</div>
          <div className="card-big">{fmtUSD(salesWeek)}</div>
        </div>
        <div className="card">
          <div className="card-title">THIS MONTH — SALES</div>
          <div className="card-big">{fmtUSD(salesMonth)}</div>
        </div>
        <div className="card">
          <div className="card-title">YTD — SALES</div>
          <div className="card-big">{fmtUSD(salesYTD)}</div>
        </div>

        <div className="card">
          <div className="card-title">TODAY — EXPENSES</div>
          <div className="card-big">{fmtUSD(expToday)}</div>
        </div>
        <div className="card">
          <div className="card-title">THIS WEEK — EXPENSES</div>
          <div className="card-big">{fmtUSD(expWeek)}</div>
        </div>
        <div className="card">
          <div className="card-title">THIS MONTH — EXPENSES</div>
          <div className="card-big">{fmtUSD(expMonth)}</div>
        </div>
        <div className="card">
          <div className="card-title">YTD — EXPENSES</div>
          <div className="card-big">{fmtUSD(expYTD)}</div>
        </div>

        <div className="card md:col-span-2">
          <div className="card-title">THIS MONTH — PROFIT / LOSS</div>
          <div className="card-big text-rose-400">{fmtUSD(profitThisMonth)}</div>
        </div>
        <div className="card md:col-span-2">
          <div className="card-title">YTD — PROFIT / LOSS</div>
          <div className="card-big text-rose-400">{fmtUSD(profitYTD)}</div>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card">
          <div className="card-title">Last 7 days — Sales</div>
          <div className="card-table">
            {sales7.length === 0 ? (
              <div className="py-6 opacity-70">No data in the last 7 days.</div>
            ) : (
              <table className="w-full">
                <tbody>
                  {sales7.map((r) => (
                    <tr key={r.day}>
                      <td className="py-1">{r.day}</td>
                      <td className="py-1 text-right">{fmtUSD(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-title">Last 7 days — Expenses</div>
          <div className="card-table">
            {exp7.length === 0 ? (
              <div className="py-6 opacity-70">No data in the last 7 days.</div>
            ) : (
              <table className="w-full">
                <tbody>
                  {exp7.map((r) => (
                    <tr key={r.day}>
                      <td className="py-1">{r.day}</td>
                      <td className="py-1 text-right">{fmtUSD(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </section>

      <div className="flex gap-3">
        <Link href="/sales" className="btn">Sales details</Link>
        <Link href="/expenses" className="btn">Expenses details</Link>
      </div>
    </main>
  );
}
