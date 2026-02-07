import "server-only";
import DashboardControls from "../_components/DashboardControls";
import DefinitionsDrawer from "../_components/DefinitionsDrawer";
import KpiCard from "../_components/KpiCard";
import { resolveRange } from "../_components/dateRange";
import { createServerClient } from "@/lib/supabase/server";
import { SalesExpensesProfitLine } from "../_components/Charts";

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(Number(n) || 0);

function clamp2(n: number) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function startOfWeekMonFromISO(isoDate: string) {
  // isoDate: YYYY-MM-DD
  const d = new Date(`${isoDate}T00:00:00`);
  const day = d.getDay(); // 0 Sun..6 Sat
  const diff = (day + 6) % 7; // Mon->0, Sun->6
  d.setDate(d.getDate() - diff);
  return toISODate(d);
}
function addDaysISO(isoDate: string, days: number) {
  const d = new Date(`${isoDate}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}
function pct(n: number, d: number) {
  return d > 0 ? (n / d) * 100 : 0;
}

export default async function ExecutiveDashboard(props: any) {
  const sp = (await props?.searchParams) ?? props?.searchParams ?? {};
  const range = resolveRange(sp);
  const supabase = await createServerClient();

  // --- Sales day totals
  const { data: salesDays, error: salesErr } = await supabase
    .from("v_sales_day_totals_net")
    .select("day, net_sales, gross_sales, discounts, taxes, orders")
    .order("day", { ascending: true });

  if (salesErr) {
    return (
      <div className="rounded border border-red-900/60 p-4">
        <div className="font-semibold">Dashboard query error</div>
        <div className="text-sm opacity-80 mt-1">{salesErr.message}</div>
      </div>
    );
  }

  const inRange = (d: string) => d >= range.start && d < range.end;
  const salesRows = (salesDays ?? []).filter((r: any) => inRange(String(r.day)));

  const netSales = salesRows.reduce((a: number, r: any) => a + Number(r.net_sales || 0), 0);
  const grossSales = salesRows.reduce((a: number, r: any) => a + Number(r.gross_sales || 0), 0);
  const discounts = salesRows.reduce((a: number, r: any) => a + Number(r.discounts || 0), 0);
  const taxes = salesRows.reduce((a: number, r: any) => a + Number(r.taxes || 0), 0);
  const orders = salesRows.reduce((a: number, r: any) => a + Number(r.orders || 0), 0);

  // --- Expenses (normalized)
  const { data: expNorm, error: expErr } = await supabase
    .from("v_expense_categories_normalized")
    .select("occurred_at, amount_usd, category_norm");

  if (expErr) {
    return (
      <div className="rounded border border-red-900/60 p-4">
        <div className="font-semibold">Dashboard query error</div>
        <div className="text-sm opacity-80 mt-1">{expErr.message}</div>
      </div>
    );
  }

  const expRows = (expNorm ?? []).filter((r: any) => {
    const day = String(r.occurred_at ?? "").slice(0, 10);
    return day && day >= range.start && day < range.end;
  });

  const totalExpenses = expRows.reduce((a: number, r: any) => a + Number(r.amount_usd || 0), 0);
  const profit = netSales - totalExpenses;
  const marginPct = netSales > 0 ? (profit / netSales) * 100 : 0;
  const aov = orders > 0 ? netSales / orders : 0;

  // --- Expense totals by category (for top-3 signals)
  const byCat = new Map<string, number>();
  for (const r of expRows as any[]) {
    const k = String(r.category_norm ?? "Misc");
    byCat.set(k, (byCat.get(k) || 0) + Number(r.amount_usd || 0));
  }
  const categoryOrder = ["Food", "Labor", "Rent", "Utilities", "Marketing", "Misc"];
  const categoryTotals = categoryOrder.map((k) => ({
    name: k,
    value: clamp2(byCat.get(k) || 0),
  }));
  const top3Cats = categoryTotals
    .slice()
    .sort((a, b) => Number(b.value || 0) - Number(a.value || 0))
    .slice(0, 3);

  // --- Weekly trend (Executive = weekly, not daily)
  const expenseByDay = new Map<string, number>();
  for (const r of expRows as any[]) {
    const day = String(r.occurred_at ?? "").slice(0, 10);
    expenseByDay.set(day, (expenseByDay.get(day) || 0) + Number(r.amount_usd || 0));
  }

  type WeekAgg = { week: string; net_sales: number; expenses: number; profit: number; orders: number };
  const weekMap = new Map<string, WeekAgg>();

  for (const r of salesRows as any[]) {
    const day = String(r.day);
    const wk = startOfWeekMonFromISO(day);
    const exp = Number(expenseByDay.get(day) || 0);
    const ns = Number(r.net_sales || 0);
    const ord = Number(r.orders || 0);

    const cur = weekMap.get(wk) ?? { week: wk, net_sales: 0, expenses: 0, profit: 0, orders: 0 };
    cur.net_sales += ns;
    cur.expenses += exp;
    cur.orders += ord;
    weekMap.set(wk, cur);
  }

  // finalize + sort
  const weeklySeries = Array.from(weekMap.values())
    .map((w) => ({
      key: `${w.week} → ${addDaysISO(w.week, 6)}`,
      net_sales: clamp2(w.net_sales),
      expenses: clamp2(w.expenses),
      profit: clamp2(w.net_sales - w.expenses),
      orders: w.orders,
    }))
    .sort((a, b) => String(a.key).localeCompare(String(b.key)));

  // best week signal (by net sales)
  const bestWeek = weeklySeries.length
    ? weeklySeries.slice().sort((a, b) => Number(b.net_sales) - Number(a.net_sales))[0]
    : null;

  const biggestCat = categoryTotals.length
    ? categoryTotals.slice().sort((a, b) => Number(b.value) - Number(a.value))[0]
    : null;

  const definitions = [
    { label: "Gross Sales", formula: "SUM(qty * unit_price)", note: "Total before discounts and taxes." },
    { label: "Discounts", formula: "SUM(discount)", note: "All discounts applied to sales." },
    { label: "Taxes", formula: "SUM(tax)", note: "Sales tax collected (not revenue)." },
    { label: "Net Sales", formula: "SUM(total)", note: "Main sales number used in dashboards." },
    { label: "Expenses", formula: "SUM(expenses.amount_usd)", note: "Sum of expenses in the selected date range." },
    { label: "Profit", formula: "Net Sales - Expenses" },
    { label: "Margin %", formula: "Profit / Net Sales" },
    { label: "Orders", formula: "COUNT(DISTINCT sales_orders.id)" },
    { label: "AOV", formula: "Net Sales / Orders" },
    { label: "Weekly Trend", formula: "Aggregate daily totals into Monday-start weeks" },
    { label: "Top Expense Categories", formula: "SUM(expenses.amount_usd) grouped by category_norm" },
  ];

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="text-sm opacity-70">
          Range: <strong>{range.start}</strong> → <strong>{range.end}</strong> (end exclusive)
        </div>
        <DefinitionsDrawer items={definitions} />
      </div>

      <DashboardControls />

      {/* Executive KPIs (high-level) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <KpiCard label="Net Sales" value={fmtCurrency(netSales)} hint="Main revenue number used in dashboards." formula="SUM(total)" />
        <KpiCard label="Expenses" value={fmtCurrency(totalExpenses)} hint="Operating expenses in this range." formula="SUM(expenses.amount_usd)" />
        <KpiCard label="Profit" value={fmtCurrency(profit)} hint="Net Sales minus Expenses." formula="Net Sales - Expenses" />
        <KpiCard label="Margin %" value={`${clamp2(marginPct)}%`} hint="Profit divided by Net Sales." formula="Profit / Net Sales" />

        <KpiCard label="Orders" value={String(orders)} hint="Unique orders in this range." formula="COUNT(DISTINCT orders)" />
        <KpiCard label="AOV" value={fmtCurrency(aov)} hint="Average order value." formula="Net Sales / Orders" />
        <KpiCard label="Gross Sales" value={fmtCurrency(grossSales)} hint="Before discounts and taxes." formula="SUM(qty * unit_price)" />
        <KpiCard label="Discounts" value={fmtCurrency(discounts)} hint="Total discounts given." formula="SUM(discount)" />
      </div>

      {/* Executive = weekly trend + top category signals */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded border border-neutral-800 p-4 lg:col-span-2">
          <div className="font-semibold mb-2">Weekly Snapshot: Net Sales vs Expenses vs Profit</div>
          <div className="text-sm opacity-70 mb-4">
            Executive view uses weekly totals to show direction without daily noise.
          </div>
          <SalesExpensesProfitLine data={weeklySeries} />
        </div>

        <div className="rounded border border-neutral-800 p-4">
          <div className="font-semibold mb-2">Top Expense Signals</div>
          <div className="text-sm opacity-70 mb-4">
            Biggest categories in the selected range (with % of Net Sales).
          </div>

          <div className="space-y-2">
            {top3Cats.map((c, idx) => {
              const pctOfSales = pct(Number(c.value || 0), netSales);
              return (
                <div
                  key={`${c.name}-${idx}`}
                  className="rounded border border-neutral-800 bg-neutral-950/40 px-3 py-2 flex items-center justify-between gap-3"
                  title={`Formula: SUM(expenses.amount_usd) WHERE category_norm='${c.name}'`}
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">{c.name}</div>
                    <div className="text-xs opacity-70">
                      {clamp2(pctOfSales)}% of Net Sales
                    </div>
                  </div>
                  <div className="font-semibold">{fmtCurrency(c.value)}</div>
                </div>
              );
            })}

            {!top3Cats.length && <div className="text-sm opacity-70">No expense data in this range.</div>}
          </div>

          {/* Quick executive signals */}
          <div className="mt-4 rounded border border-neutral-800 bg-neutral-950/40 p-3">
            <div className="text-sm font-semibold mb-2">Signals</div>
            <ul className="text-sm opacity-80 space-y-1 list-disc pl-5">
              <li>
                Profit: <strong>{fmtCurrency(profit)}</strong> ({clamp2(marginPct)}% margin)
              </li>
              <li>
                Biggest expense bucket:{" "}
                <strong>{biggestCat?.name ?? "—"}</strong>{" "}
                ({fmtCurrency(biggestCat?.value ?? 0)})
              </li>
              <li>
                Best week (Net Sales):{" "}
                <strong>{bestWeek?.key ?? "—"}</strong>{" "}
                ({fmtCurrency(bestWeek?.net_sales ?? 0)})
              </li>
              <li>
                Taxes collected: <strong>{fmtCurrency(taxes)}</strong> (not profit)
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
