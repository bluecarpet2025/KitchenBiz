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
function clampPct(n: number) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function toISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function addDaysISO(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toISO(d);
}
function daysBetween(startISO: string, endISO: string) {
  const a = new Date(`${startISO}T00:00:00`).getTime();
  const b = new Date(`${endISO}T00:00:00`).getTime();
  return Math.max(0, Math.floor((b - a) / (1000 * 60 * 60 * 24)));
}
function startOfWeekMonISO(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  const day = d.getDay(); // 0 Sun..6 Sat
  const diff = (day + 6) % 7; // Mon->0, Sun->6
  d.setDate(d.getDate() - diff);
  return toISO(d);
}
function pctChange(current: number, prior: number) {
  const c = Number(current) || 0;
  const p = Number(prior) || 0;
  if (p === 0) return c === 0 ? 0 : 100;
  return ((c - p) / p) * 100;
}
function fmtSignedPct(n: number) {
  const v = clampPct(n);
  const sign = v > 0 ? "+" : "";
  return `${sign}${v}%`;
}
function fmtSignedPts(n: number) {
  const v = clampPct(n);
  const sign = v > 0 ? "+" : "";
  return `${sign}${v} pts`;
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

  const inRange = (d: string) => d >= range.start && d < range.end;

  const salesRows = (salesDays ?? []).filter((r: any) => inRange(String(r.day)));

  const expRows = (expNorm ?? []).filter((r: any) => {
    const day = String(r.occurred_at ?? "").slice(0, 10);
    return day && day >= range.start && day < range.end;
  });

  // --- Totals (current period)
  const netSales = salesRows.reduce((a: number, r: any) => a + Number(r.net_sales || 0), 0);
  const grossSales = salesRows.reduce((a: number, r: any) => a + Number(r.gross_sales || 0), 0);
  const discounts = salesRows.reduce((a: number, r: any) => a + Number(r.discounts || 0), 0);
  const taxes = salesRows.reduce((a: number, r: any) => a + Number(r.taxes || 0), 0);
  const orders = salesRows.reduce((a: number, r: any) => a + Number(r.orders || 0), 0);

  const totalExpenses = expRows.reduce((a: number, r: any) => a + Number(r.amount_usd || 0), 0);
  const profit = netSales - totalExpenses;
  const marginPct = netSales > 0 ? (profit / netSales) * 100 : 0;
  const aov = orders > 0 ? netSales / orders : 0;

  // --- Prior period (same length immediately before range.start)
  const lenDays = daysBetween(range.start, range.end);
  const priorStart = addDaysISO(range.start, -lenDays);
  const priorEnd = range.start;

  const priorSales = (salesDays ?? []).filter((r: any) => {
    const d = String(r.day);
    return d >= priorStart && d < priorEnd;
  });

  const priorExp = (expNorm ?? []).filter((r: any) => {
    const day = String(r.occurred_at ?? "").slice(0, 10);
    return day && day >= priorStart && day < priorEnd;
  });

  const priorNetSales = priorSales.reduce((a: number, r: any) => a + Number(r.net_sales || 0), 0);
  const priorExpenses = priorExp.reduce((a: number, r: any) => a + Number(r.amount_usd || 0), 0);
  const priorProfit = priorNetSales - priorExpenses;
  const priorMarginPct = priorNetSales > 0 ? (priorProfit / priorNetSales) * 100 : 0;

  const netSalesDeltaPct = pctChange(netSales, priorNetSales);
  const profitDeltaPct = pctChange(profit, priorProfit);
  const marginDeltaPts = marginPct - priorMarginPct;

  // --- Weekly snapshot series (Mon-week buckets)
  const expenseByDay = new Map<string, number>();
  for (const r of expRows as any[]) {
    const day = String(r.occurred_at ?? "").slice(0, 10);
    expenseByDay.set(day, (expenseByDay.get(day) || 0) + Number(r.amount_usd || 0));
  }

  const weekAgg = new Map<string, { net_sales: number; expenses: number; profit: number }>();
  for (const r of salesRows as any[]) {
    const day = String(r.day);
    const wk = startOfWeekMonISO(day);
    const ns = Number(r.net_sales || 0);
    const exp = Number(expenseByDay.get(day) || 0);
    const cur = weekAgg.get(wk) || { net_sales: 0, expenses: 0, profit: 0 };
    cur.net_sales += ns;
    cur.expenses += exp;
    cur.profit += ns - exp;
    weekAgg.set(wk, cur);
  }

  const weeklyData = Array.from(weekAgg.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([wk, v]) => ({
      key: wk,
      net_sales: clamp2(v.net_sales),
      expenses: clamp2(v.expenses),
      profit: clamp2(v.profit),
    }));

  // --- Expense category rollups + top signals
  const byCat = new Map<string, number>();
  for (const r of expRows as any[]) {
    const k = String(r.category_norm ?? "Misc");
    byCat.set(k, (byCat.get(k) || 0) + Number(r.amount_usd || 0));
  }

  const catRows = Array.from(byCat.entries())
    .map(([name, value]) => ({ name, value: clamp2(value) }))
    .sort((a, b) => b.value - a.value);

  const topCats = catRows.slice(0, 3);

  // Best week by net sales
  let bestWeekKey = "";
  let bestWeekNet = -Infinity;
  for (const [wk, v] of weekAgg.entries()) {
    if (v.net_sales > bestWeekNet) {
      bestWeekNet = v.net_sales;
      bestWeekKey = wk;
    }
  }

  const definitions = [
    { label: "Gross Sales", formula: "SUM(qty * unit_price)", note: "Total before discounts and taxes." },
    { label: "Discounts", formula: "SUM(discount)", note: "All discounts applied to sales." },
    { label: "Taxes", formula: "SUM(tax)", note: "Sales tax collected (not revenue)." },
    { label: "Net Sales", formula: "SUM(total)", note: "Main sales number used throughout the dashboards." },
    { label: "Expenses", formula: "SUM(expenses.amount_usd)", note: "Sum of expenses in the selected date range." },
    { label: "Profit", formula: "Net Sales - Expenses" },
    { label: "Margin %", formula: "Profit / Net Sales" },
    { label: "Orders", formula: "COUNT(DISTINCT sales_orders.id)" },
    { label: "AOV", formula: "Net Sales / Orders", note: "Average order value." },
    {
      label: "Prior period comparison",
      formula: "Same number of days immediately before selected range",
      note: `${priorStart} → ${priorEnd} (end exclusive)`,
    },
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

      {/* Executive KPIs: keep it tight */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <KpiCard label="Net Sales" value={fmtCurrency(netSales)} hint="Revenue after discounts/tax line handling." formula="SUM(total)" />
        <KpiCard label="Expenses" value={fmtCurrency(totalExpenses)} hint="Operating expenses in this range." formula="SUM(expenses.amount_usd)" />
        <KpiCard label="Profit" value={fmtCurrency(profit)} hint="Net Sales minus Expenses." formula="Net Sales - Expenses" />
        <KpiCard label="Margin %" value={`${clampPct(marginPct)}%`} hint="Profit divided by Net Sales." formula="Profit / Net Sales" />
        <KpiCard label="Orders" value={String(orders)} hint="Unique orders in this range." formula="COUNT(DISTINCT orders)" />
        <KpiCard label="AOV" value={fmtCurrency(aov)} hint="Average order value." formula="Net Sales / Orders" />
        <KpiCard label="Gross Sales" value={fmtCurrency(grossSales)} hint="Before discounts and taxes." formula="SUM(qty * unit_price)" />
        <KpiCard label="Discounts" value={fmtCurrency(discounts)} hint="Total discounts given." formula="SUM(discount)" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Weekly snapshot chart */}
        <div className="rounded border border-neutral-800 p-4 lg:col-span-2">
          <div className="font-semibold mb-2">Weekly Snapshot: Net Sales vs Expenses vs Profit</div>
          <div className="text-sm opacity-70 mb-4">
            Executive view uses weekly totals to show direction without daily noise.
          </div>
          <SalesExpensesProfitLine data={weeklyData.length ? weeklyData : [{ key: "—", net_sales: 0, expenses: 0, profit: 0 }]} />
        </div>

        {/* Signals + top expense buckets */}
        <div className="rounded border border-neutral-800 p-4">
          <div className="font-semibold mb-2">Top Expense Signals</div>
          <div className="text-sm opacity-70 mb-4">
            Biggest categories in the selected range (with % of Net Sales).
          </div>

          <div className="space-y-2 mb-4">
            {topCats.length ? (
              topCats.map((c) => {
                const pct = netSales > 0 ? (c.value / netSales) * 100 : 0;
                return (
                  <div
                    key={c.name}
                    className="flex items-center justify-between gap-3 rounded border border-neutral-800 bg-neutral-950/40 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">{c.name}</div>
                      <div className="text-xs opacity-70">{clampPct(pct)}% of Net Sales</div>
                    </div>
                    <div className="font-semibold">{fmtCurrency(c.value)}</div>
                  </div>
                );
              })
            ) : (
              <div className="text-sm opacity-70">No expenses in this range.</div>
            )}
          </div>

          <div className="text-sm opacity-80 font-medium mb-2">Signals</div>
          <ul className="text-sm opacity-80 space-y-1 list-disc pl-5">
            <li>
              Net Sales vs prior period: <strong>{fmtSignedPct(netSalesDeltaPct)}</strong>
            </li>
            <li>
              Profit vs prior period: <strong>{fmtSignedPct(profitDeltaPct)}</strong>
            </li>
            <li>
              Margin vs prior period: <strong>{fmtSignedPts(marginDeltaPts)}</strong>
            </li>
            <li>
              Profit: <strong>{fmtCurrency(profit)}</strong> ({clampPct(marginPct)}% margin)
            </li>
            <li>
              Biggest expense bucket:{" "}
              <strong>{topCats[0]?.name ?? "—"}</strong> ({fmtCurrency(topCats[0]?.value ?? 0)})
            </li>
            <li>
              Best week (Net Sales):{" "}
              <strong>{bestWeekKey ? `${bestWeekKey} → ${addDaysISO(bestWeekKey, 7)}` : "—"}</strong>{" "}
              ({fmtCurrency(bestWeekNet > -Infinity ? bestWeekNet : 0)})
            </li>
            <li>
              Taxes collected: <strong>{fmtCurrency(taxes)}</strong> (not profit)
            </li>
          </ul>

          <div className="text-xs opacity-60 mt-3">
            Prior period used: <strong>{priorStart}</strong> → <strong>{priorEnd}</strong> (end exclusive)
          </div>
        </div>
      </div>
    </div>
  );
}
