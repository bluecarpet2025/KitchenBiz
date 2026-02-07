import "server-only";

import DashboardControls from "../_components/DashboardControls";
import DefinitionsDrawer from "../_components/DefinitionsDrawer";
import KpiCard from "../_components/KpiCard";
import { resolveRange } from "../_components/dateRange";
import { createServerClient } from "@/lib/supabase/server";
import {
  SalesExpensesProfitLine,
  CategoryBars,
  WeekdayBars,
} from "../_components/Charts";

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(Number(n) || 0);

function clamp2(n: number) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function clampPct(n: number) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function toWeekdayLabel(isoDate: string) {
  // isoDate: YYYY-MM-DD
  const d = new Date(`${isoDate}T00:00:00`);
  const idx = d.getDay(); // 0=Sun..6=Sat
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][idx] ?? "—";
}

export default async function FinancialDashboard(props: any) {
  const sp = (await props?.searchParams) ?? props?.searchParams ?? {};
  const range = resolveRange(sp);

  const supabase = await createServerClient();

  // --- Sales day totals (already tenant-safe via view + RLS)
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

  // --- Expenses (normalized categories)
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

  // --- Prime cost style rollups from normalized buckets
  const byCat = new Map<string, number>();
  for (const r of expRows as any[]) {
    const k = String(r.category_norm ?? "Misc");
    byCat.set(k, (byCat.get(k) || 0) + Number(r.amount_usd || 0));
  }

  const food = Number(byCat.get("Food") || 0);
  const labor = Number(byCat.get("Labor") || 0);
  const rent = Number(byCat.get("Rent") || 0);
  const utilities = Number(byCat.get("Utilities") || 0);
  const marketing = Number(byCat.get("Marketing") || 0);
  const misc = Number(byCat.get("Misc") || 0);

  const primeCost = food + labor;
  const foodPct = netSales > 0 ? (food / netSales) * 100 : 0;
  const laborPct = netSales > 0 ? (labor / netSales) * 100 : 0;
  const primePct = netSales > 0 ? (primeCost / netSales) * 100 : 0;

  // --- Category bars (6 bucket bars)
  const categoryBars = ["Food", "Labor", "Rent", "Utilities", "Marketing", "Misc"].map((k) => ({
    name: k,
    value: clamp2(byCat.get(k) || 0),
  }));

  // --- Line series (daily): net sales vs expenses vs profit
  const expenseByDay = new Map<string, number>();
  for (const r of expRows as any[]) {
    const day = String(r.occurred_at ?? "").slice(0, 10);
    expenseByDay.set(day, (expenseByDay.get(day) || 0) + Number(r.amount_usd || 0));
  }

  const lineData = salesRows.map((r: any) => {
    const day = String(r.day);
    const exp = Number(expenseByDay.get(day) || 0);
    const ns = Number(r.net_sales || 0);
    return {
      key: day,
      net_sales: clamp2(ns),
      expenses: clamp2(exp),
      profit: clamp2(ns - exp),
    };
  });

  // --- Weekday net sales (simple & helpful for restaurant owners)
  const weekdayTotals = new Map<string, number>();
  for (const r of salesRows as any[]) {
    const day = String(r.day);
    const wd = toWeekdayLabel(day);
    weekdayTotals.set(wd, (weekdayTotals.get(wd) || 0) + Number(r.net_sales || 0));
  }
  const weekdayOrder = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const weekdayData = weekdayOrder.map((wd) => ({
    name: wd,
    value: clamp2(weekdayTotals.get(wd) || 0),
  }));

  const definitions = [
    { label: "Gross Sales", formula: "SUM(qty * unit_price)", note: "Total before discounts and taxes." },
    { label: "Discounts", formula: "SUM(discount)", note: "All discounts applied to sales." },
    { label: "Taxes", formula: "SUM(tax)", note: "Sales tax collected (not profit)." },
    { label: "Net Sales", formula: "SUM(total)", note: "Main sales number used throughout the dashboards." },
    { label: "Expenses", formula: "SUM(expenses.amount_usd)", note: "Sum of expenses in the selected date range." },
    { label: "Profit", formula: "Net Sales - Expenses" },
    { label: "Margin %", formula: "Profit / Net Sales" },
    { label: "Orders", formula: "COUNT(DISTINCT sales_orders.id)" },
    { label: "AOV", formula: "Net Sales / Orders", note: "Average order value." },
    {
      label: "Food",
      formula: "SUM(expenses.amount_usd) WHERE category_norm = 'Food'",
      note: "Food-related expenses (normalized).",
    },
    {
      label: "Labor",
      formula: "SUM(expenses.amount_usd) WHERE category_norm = 'Labor'",
      note: "Labor-related expenses (normalized).",
    },
    { label: "Prime Cost", formula: "Food + Labor", note: "A common restaurant metric." },
    { label: "Food %", formula: "Food / Net Sales" },
    { label: "Labor %", formula: "Labor / Net Sales" },
    { label: "Prime %", formula: "(Food + Labor) / Net Sales" },
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

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <KpiCard label="Net Sales" value={fmtCurrency(netSales)} hint="Revenue after discounts/tax line handling." formula="SUM(total)" />
        <KpiCard label="Expenses" value={fmtCurrency(totalExpenses)} hint="Operating expenses in this range." formula="SUM(expenses.amount_usd)" />
        <KpiCard label="Profit" value={fmtCurrency(profit)} hint="Net Sales minus Expenses." formula="Net Sales - Expenses" />
        <KpiCard label="Margin %" value={`${clampPct(marginPct)}%`} hint="Profit divided by Net Sales." formula="Profit / Net Sales" />

        <KpiCard label="Prime Cost" value={fmtCurrency(primeCost)} hint="Food + Labor." formula="Food + Labor" />
        <KpiCard label="Prime %" value={`${clampPct(primePct)}%`} hint="Prime cost as a % of net sales." formula="(Food + Labor) / Net Sales" />
        <KpiCard label="Food %" value={`${clampPct(foodPct)}%`} hint="Food as a % of net sales." formula="Food / Net Sales" />
        <KpiCard label="Labor %" value={`${clampPct(laborPct)}%`} hint="Labor as a % of net sales." formula="Labor / Net Sales" />

        <KpiCard label="Orders" value={String(orders)} hint="Unique orders in this range." formula="COUNT(DISTINCT orders)" />
        <KpiCard label="AOV" value={fmtCurrency(aov)} hint="Average order value." formula="Net Sales / Orders" />
        <KpiCard label="Gross Sales" value={fmtCurrency(grossSales)} hint="Before discounts and taxes." formula="SUM(qty * unit_price)" />
        <KpiCard label="Taxes" value={fmtCurrency(taxes)} hint="Sales tax collected." formula="SUM(tax)" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded border border-neutral-800 p-4">
          <div className="font-semibold mb-2">Net Sales vs Expenses vs Profit (daily)</div>
          <div className="text-sm opacity-70 mb-4">Trend over the selected range.</div>
          <SalesExpensesProfitLine data={lineData} />
        </div>

        <div className="rounded border border-neutral-800 p-4">
          <div className="font-semibold mb-2">Expenses by Category</div>
          <div className="text-sm opacity-70 mb-4">
            Categories are normalized into: Food, Labor, Rent, Utilities, Marketing, Misc.
          </div>
          <CategoryBars data={categoryBars} />
        </div>

        <div className="rounded border border-neutral-800 p-4 lg:col-span-2">
          <div className="font-semibold mb-2">Net Sales by Weekday</div>
          <div className="text-sm opacity-70 mb-4">
            Helpful for spotting strong/weak days of the week.
          </div>
          <WeekdayBars data={weekdayData} />
        </div>
      </div>

      {/* Mini breakdown (P&L-lite) */}
      <div className="rounded border border-neutral-800 p-4 mt-4">
        <div className="font-semibold mb-2">Simple Breakdown (P&amp;L-lite)</div>
        <div className="text-sm opacity-70 mb-4">A quick summary of the selected range.</div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="rounded border border-neutral-800 p-3 bg-neutral-950/40">
            <div className="text-sm opacity-80">Net Sales</div>
            <div className="text-xl font-semibold mt-1">{fmtCurrency(netSales)}</div>
          </div>
          <div className="rounded border border-neutral-800 p-3 bg-neutral-950/40">
            <div className="text-sm opacity-80">Prime Cost (Food + Labor)</div>
            <div className="text-xl font-semibold mt-1">{fmtCurrency(primeCost)}</div>
            <div className="text-sm opacity-70 mt-1">{clampPct(primePct)}%</div>
          </div>
          <div className="rounded border border-neutral-800 p-3 bg-neutral-950/40">
            <div className="text-sm opacity-80">Other Expenses</div>
            <div className="text-xl font-semibold mt-1">
              {fmtCurrency(Math.max(0, totalExpenses - primeCost))}
            </div>
            <div className="text-sm opacity-70 mt-1">
              Rent {fmtCurrency(rent)} • Utilities {fmtCurrency(utilities)} • Marketing {fmtCurrency(marketing)} • Misc {fmtCurrency(misc)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
