// src/app/expenses/page.tsx
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { getEffectiveTenant } from "@/lib/effective-tenant";
import { fmtUSD } from "@/lib/costing";

export const dynamic = "force-dynamic";

type MonthRow = { tenant_id: string; month: string; entries: number; total: number };
type WeekRow  = { tenant_id: string; week: string;  entries: number; total: number };
type DayRow   = { tenant_id: string; day: string;   entries: number; total: number };
type QRow     = { tenant_id: string; quarter: string; entries: number; total: number };
type YRow     = { tenant_id: string; year: string;  entries: number; total: number };
type CatRow   = { tenant_id: string; category: string | null; total: number };

async function fetchAll() {
  const supabase = await createServerClient();
  const tenantId = await getEffectiveTenant(supabase);

  const pick = <T,>(r: { data: T[] | null; error: any }) => (r.data ?? []) as T[];

  const month = pick<MonthRow>(
    await supabase.from("v_expense_month_totals")
      .select("tenant_id,month,entries,total")
      .eq("tenant_id", tenantId)
      .order("month", { ascending: false })
      .limit(24)
  );

  const week = pick<WeekRow>(
    await supabase.from("v_expense_week_totals")
      .select("tenant_id,week,entries,total")
      .eq("tenant_id", tenantId)
      .order("week", { ascending: false })
      .limit(24)
  );

  const day = pick<DayRow>(
    await supabase.from("v_expense_day_totals")
      .select("tenant_id,day,entries,total")
      .eq("tenant_id", tenantId)
      .order("day", { ascending: false })
      .limit(31)
  );

  const quarter = pick<QRow>(
    await supabase.from("v_expense_quarter_totals")
      .select("tenant_id,quarter,entries,total")
      .eq("tenant_id", tenantId)
      .order("quarter", { ascending: false })
      .limit(8)
  );

  const year = pick<YRow>(
    await supabase.from("v_expense_year_totals")
      .select("tenant_id,year,entries,total")
      .eq("tenant_id", tenantId)
      .order("year", { ascending: false })
      .limit(10)
  );

  const cats = pick<CatRow>(
    await supabase.from("v_expense_category_ytd")
      .select("tenant_id,category,total")
      .eq("tenant_id", tenantId)
      .order("total", { ascending: false })
      .limit(10)
  );

  return { month, week, day, quarter, year, cats };
}

export default async function ExpensesPage() {
  const { month, week, day, quarter, year, cats } = await fetchAll();

  const Section = ({
    title,
    headA,
    headB,
    rows,
    getA,
    getB,
  }: {
    title: string;
    headA: string;
    headB: string;
    rows: any[];
    getA: (r: any) => string;
    getB: (r: any) => string;
  }) => (
    <details className="border rounded-lg mb-4" open>
      <summary className="px-3 py-2 cursor-pointer bg-neutral-900/60">{title}</summary>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-t">
            <th className="p-2 text-left">{headA}</th>
            <th className="p-2 text-center">Entries</th>
            <th className="p-2 text-right">{headB}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r: any, i: number) => (
            <tr key={i} className="border-t">
              <td className="p-2">{getA(r)}</td>
              <td className="p-2 text-center">{r.entries ?? "—"}</td>
              <td className="p-2 text-right">{fmtUSD(Number(r.total ?? 0))}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td className="p-3 text-neutral-400" colSpan={3}>No data.</td></tr>
          )}
        </tbody>
      </table>
    </details>
  );

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Expenses</h1>
        <div className="flex gap-2">
          <Link href="/expenses/manage" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">Manage</Link>
          <Link href="/expenses/import" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">Import CSV</Link>
          <Link href="/expenses/template" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">Download template</Link>
        </div>
      </div>

      <Section
        title="Month totals"
        headA="Month"
        headB="Amount"
        rows={month}
        getA={(r) => r.month}
        getB={(r) => fmtUSD(Number(r.total ?? 0))}
      />
      <Section
        title="Week totals"
        headA="Week"
        headB="Amount"
        rows={week}
        getA={(r) => r.week}
        getB={(r) => fmtUSD(Number(r.total ?? 0))}
      />
      <Section
        title="Day totals"
        headA="Day"
        headB="Amount"
        rows={day}
        getA={(r) => r.day}
        getB={(r) => fmtUSD(Number(r.total ?? 0))}
      />
      <Section
        title="Quarter totals"
        headA="Quarter"
        headB="Amount"
        rows={quarter}
        getA={(r) => r.quarter}
        getB={(r) => fmtUSD(Number(r.total ?? 0))}
      />
      <Section
        title="Year totals"
        headA="Year"
        headB="Amount"
        rows={year}
        getA={(r) => r.year}
        getB={(r) => fmtUSD(Number(r.total ?? 0))}
      />

      <div className="border rounded-lg">
        <div className="px-3 py-2 bg-neutral-900/60">Top categories (YTD)</div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-t">
              <th className="p-2 text-left">Category</th>
              <th className="p-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {cats.map((r, i) => (
              <tr key={i} className="border-t">
                <td className="p-2">{r.category ?? "—"}</td>
                <td className="p-2 text-right">{fmtUSD(Number(r.total ?? 0))}</td>
              </tr>
            ))}
            {cats.length === 0 && (
              <tr><td className="p-3 text-neutral-400" colSpan={2}>No data.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
