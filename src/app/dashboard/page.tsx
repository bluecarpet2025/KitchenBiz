// src/app/dashboard/page.tsx
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import {
  sumOne,
  daySeries,
  todayStr,
  weekStr,
  monthStr,
  yearStr,
  addDays,
} from "@/lib/db";

const fmtUSD = (n: number) =>
  n.toLocaleString(undefined, { style: "currency", currency: "USD" });

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
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
  const today = todayStr();
  const thisWeek = weekStr(now);
  const thisMonth = monthStr(now);
  const thisYear = yearStr(now);
  const last7Start = todayStr(addDays(new Date(), -6));

  // SALES — use revenue
  const [salesToday, salesWeek, salesMonth, salesYTD] = await Promise.all([
    sumOne(supabase, "v_sales_day_totals", "day", today, tenantId, "revenue"),
    sumOne(supabase, "v_sales_week_totals", "week", thisWeek, tenantId, "revenue"),
    sumOne(supabase, "v_sales_month_totals", "month", thisMonth, tenantId, "revenue"),
    sumOne(supabase, "v_sales_year_totals", "year", thisYear, tenantId, "revenue"),
  ]);

  // EXPENSES — use total
  const [expToday, expWeek, expMonth, expYTD] = await Promise.all([
    sumOne(supabase, "v_expense_day_totals", "day", today, tenantId, "total"),
    sumOne(supabase, "v_expense_week_totals", "week", thisWeek, tenantId, "total"),
    sumOne(supabase, "v_expense_month_totals", "month", thisMonth, tenantId, "total"),
    sumOne(supabase, "v_expense_year_totals", "year", thisYear, tenantId, "total"),
  ]);

  const profitThisMonth = salesMonth - expMonth;
  const profitYTD = salesYTD - expYTD;

  // Last 7 days
  const [sales7, exp7] = await Promise.all([
    daySeries(supabase, "v_sales_day_totals", tenantId, last7Start, "revenue"),
    daySeries(supabase, "v_expense_day_totals", tenantId, last7Start, "total"),
  ]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex gap-3">
        <Link href="/sales/import" className="rounded border px-3 py-2 hover:bg-neutral-900">
          Import Sales CSV
        </Link>
        <Link href="/expenses/import" className="rounded border px-3 py-2 hover:bg-neutral-900">
          Import Expenses CSV
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-4">
        <Kpi title="TODAY — SALES" value={fmtUSD(salesToday)} />
        <Kpi title="THIS WEEK — SALES" value={fmtUSD(salesWeek)} />
        <Kpi title="THIS MONTH — SALES" value={fmtUSD(salesMonth)} />
        <Kpi title="YTD — SALES" value={fmtUSD(salesYTD)} />

        <Kpi title="TODAY — EXPENSES" value={fmtUSD(expToday)} />
        <Kpi title="THIS WEEK — EXPENSES" value={fmtUSD(expWeek)} />
        <Kpi title="THIS MONTH — EXPENSES" value={fmtUSD(expMonth)} />
        <Kpi title="YTD — EXPENSES" value={fmtUSD(expYTD)} />

        <Kpi title="THIS MONTH — PROFIT / LOSS" value={fmtUSD(profitThisMonth)} red={profitThisMonth < 0} wide />
        <Kpi title="YTD — PROFIT / LOSS" value={fmtUSD(profitYTD)} red={profitYTD < 0} wide />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <MiniTable title="Last 7 days — Sales" labels={sales7.labels} values={sales7.values} />
        <MiniTable title="Last 7 days — Expenses" labels={exp7.labels} values={exp7.values} />
      </div>

      <div className="flex gap-3">
        <Link href="/sales" className="rounded border px-3 py-2 hover:bg-neutral-900">
          Sales details
        </Link>
        <Link href="/expenses" className="rounded border px-3 py-2 hover:bg-neutral-900">
          Expenses details
        </Link>
      </div>
    </div>
  );
}

function Kpi({
  title,
  value,
  red,
  wide = false,
}: {
  title: string;
  value: string;
  red?: boolean;
  wide?: boolean;
}) {
  return (
    <div className={`rounded border border-neutral-800 p-5 ${wide ? "lg:col-span-2" : ""}`}>
      <div className="text-xs uppercase tracking-wide text-neutral-400">{title}</div>
      <div className={`mt-2 text-3xl font-semibold ${red ? "text-rose-400" : ""}`}>{value}</div>
    </div>
  );
}

function MiniTable({
  title,
  labels,
  values,
}: {
  title: string;
  labels: string[];
  values: number[];
}) {
  return (
    <div className="rounded border border-neutral-800">
      <div className="border-b border-neutral-800 px-4 py-2 text-sm">{title}</div>
      <table className="w-full text-sm">
        <tbody>
          {labels.length === 0 ? (
            <tr>
              <td className="px-4 py-3 text-neutral-400">No data in the last 7 days.</td>
              <td className="px-4 py-3 text-right">—</td>
            </tr>
          ) : (
            labels.map((d, i) => (
              <tr key={d} className="border-t border-neutral-900">
                <td className="px-4 py-2">{d}</td>
                <td className="px-4 py-2 text-right">{fmtUSD(values[i] ?? 0)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
