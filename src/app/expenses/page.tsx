import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { getEffectiveTenant } from "@/lib/effective-tenant";
import { fmtUSD } from "@/lib/costing";
import { effectivePlan, canUseFeature } from "@/lib/plan";
export const dynamic = "force-dynamic";

type MonthRow = { tenant_id: string; month: string; entries: number; total: number | string };
type WeekRow  = { tenant_id: string; week:  string; entries: number; total: number | string };
type DayRow   = { tenant_id: string; day:   string; entries: number; total: number | string };
type QtrRow   = { tenant_id: string; quarter: string; entries: number; total: number | string };
type YearRow  = { tenant_id: string; year:  string; entries: number; total: number | string };
type CatRow   = { tenant_id: string; category: string; total: number | string };

function Section({
  title,
  rows,
  render,
}: {
  title: string;
  rows: any[];
  render: (row: any, idx: number) => React.ReactNode;
}) {
  return (
    <details open className="border rounded-lg overflow-hidden">
      <summary className="cursor-pointer select-none bg-neutral-900/60 px-3 py-2 text-sm font-medium">
        {title}
      </summary>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-neutral-300">
              <th className="px-3 py-2 text-left">Period / Category</th>
              <th className="px-3 py-2 text-center w-28">Entries</th>
              <th className="px-3 py-2 text-right w-36">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="px-3 py-3 text-neutral-400" colSpan={3}>
                  No data.
                </td>
              </tr>
            ) : (
              rows.map(render)
            )}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export default async function ExpensesPage() {
  const supabase = await createServerClient();

  // PLAN GATE
  const plan = await effectivePlan();
  const canAccessExpenses = canUseFeature(plan, "expenses_access");
  if (!canAccessExpenses) {
    return (
      <main className="max-w-3xl mx-auto p-6 text-center">
        <h1 className="text-2xl font-semibold mb-2">Expenses</h1>
        <p className="opacity-80">Your current plan doesn’t include Expenses features.</p>
        <a href="/profile" className="inline-block mt-3 border rounded px-4 py-2 hover:bg-neutral-900">
          Upgrade plan
        </a>
      </main>
    );
  }

  const { data: au } = await supabase.auth.getUser();
  const user = au.user ?? null;
  if (!user) {
    return (
      <main className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Expenses</h1>
        <p className="mt-4">Sign in required.</p>
        <Link className="underline" href="/login?redirect=/expenses">
          Go to login
        </Link>
      </main>
    );
  }

  const tenantId = await getEffectiveTenant(supabase);
  if (!tenantId) {
    return (
      <main className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Expenses</h1>
        <p className="mt-4">Profile missing tenant.</p>
      </main>
    );
  }

  const [{ data: months }, { data: weeks }, { data: days }, { data: qtrs }, { data: years }, { data: cats }] =
    await Promise.all([
      supabase.from("v_expense_month_totals").select("*").eq("tenant_id", tenantId).order("month", { ascending: false }),
      supabase.from("v_expense_week_totals").select("*").eq("tenant_id", tenantId).order("week", { ascending: false }),
      supabase.from("v_expense_day_totals").select("*").eq("tenant_id", tenantId).order("day", { ascending: false }),
      supabase.from("v_expense_quarter_totals").select("*").eq("tenant_id", tenantId).order("quarter", { ascending: false }),
      supabase.from("v_expense_year_totals").select("*").eq("tenant_id", tenantId).order("year", { ascending: false }),
      supabase.from("v_expense_category_ytd").select("*").eq("tenant_id", tenantId).order("total", { ascending: false }),
    ]);

  const monthRows = (months ?? []) as MonthRow[];
  const weekRows  = (weeks ?? []) as WeekRow[];
  const dayRows   = (days ?? []) as DayRow[];
  const qtrRows   = (qtrs ?? []) as QtrRow[];
  const yearRows  = (years ?? []) as YearRow[];
  const catRows   = (cats ?? []) as CatRow[];

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Expenses</h1>
        <div className="flex gap-2">
          <Link href="/expenses/manage" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
            Manage
          </Link>
          <Link href="/expenses/import" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
            Import CSV
          </Link>
          <Link href="/expenses/import/template" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
            Download template
          </Link>
        </div>
      </div>

      <Section
        title="Month totals"
        rows={monthRows}
        render={(r: MonthRow, i: number) => (
          <tr key={`${r.month}-${i}`} className="border-t">
            <td className="px-3 py-2">{r.month}</td>
            <td className="px-3 py-2 text-center tabular-nums">{r.entries ?? 0}</td>
            <td className="px-3 py-2 text-right tabular-nums">{fmtUSD(Number(r.total ?? 0))}</td>
          </tr>
        )}
      />
      <Section
        title="Week totals"
        rows={weekRows}
        render={(r: WeekRow, i: number) => (
          <tr key={`${r.week}-${i}`} className="border-t">
            <td className="px-3 py-2">{r.week}</td>
            <td className="px-3 py-2 text-center tabular-nums">{r.entries ?? 0}</td>
            <td className="px-3 py-2 text-right tabular-nums">{fmtUSD(Number(r.total ?? 0))}</td>
          </tr>
        )}
      />
      <Section
        title="Day totals"
        rows={dayRows}
        render={(r: DayRow, i: number) => (
          <tr key={`${r.day}-${i}`} className="border-t">
            <td className="px-3 py-2">
              {r.day ? new Date(r.day as any).toLocaleDateString() : "—"}
            </td>
            <td className="px-3 py-2 text-center tabular-nums">{r.entries ?? 0}</td>
            <td className="px-3 py-2 text-right tabular-nums">{fmtUSD(Number(r.total ?? 0))}</td>
          </tr>
        )}
      />
      <Section
        title="Quarter totals"
        rows={qtrRows}
        render={(r: QtrRow, i: number) => (
          <tr key={`${r.quarter}-${i}`} className="border-t">
            <td className="px-3 py-2">{r.quarter}</td>
            <td className="px-3 py-2 text-center tabular-nums">{r.entries ?? 0}</td>
            <td className="px-3 py-2 text-right tabular-nums">{fmtUSD(Number(r.total ?? 0))}</td>
          </tr>
        )}
      />
      <Section
        title="Year totals"
        rows={yearRows}
        render={(r: YearRow, i: number) => (
          <tr key={`${r.year}-${i}`} className="border-t">
            <td className="px-3 py-2">{r.year}</td>
            <td className="px-3 py-2 text-center tabular-nums">{r.entries ?? 0}</td>
            <td className="px-3 py-2 text-right tabular-nums">{fmtUSD(Number(r.total ?? 0))}</td>
          </tr>
        )}
      />
      <Section
        title="Top categories (YTD)"
        rows={catRows}
        render={(r: CatRow, i: number) => (
          <tr key={`${r.category}-${i}`} className="border-t">
            <td className="px-3 py-2">{r.category || "—"}</td>
            <td className="px-3 py-2 text-center tabular-nums">—</td>
            <td className="px-3 py-2 text-right tabular-nums">{fmtUSD(Number(r.total ?? 0))}</td>
          </tr>
        )}
      />
    </main>
  );
}
