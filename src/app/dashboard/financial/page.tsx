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
  const d = new Date(`${isoDate}T00:00:00`);
  const idx = d.getDay(); // 0=Sun..6=Sat
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][idx] ?? "—";
}
function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function startOfWeekMonFromISO(isoDate: string) {
  const d = new Date(`${isoDate}T00:00:00`);
  const day = d.getDay(); // 0..6
  const diff = (day + 6) % 7; // Mon->0
  d.setDate(d.getDate() - diff);
  return toISODate(d);
}
function addDaysISO(isoDate: string, days: number) {
  const d = new Date(`${isoDate}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}
function statusLabel(actualPct: number, targetPct: number, direction: "max" | "min") {
  // max = "lower is better" (Prime%, Food%, Labor%)
  // min = "higher is better"
  if (direction === "max") {
    if (actualPct <= targetPct) return "On target";
    if (actualPct <= targetPct + 2) return "Slightly high";
    return "High";
  }
  if (actualPct >= targetPct) return "On target";
  if (actualPct >= targetPct - 2) return "Slightly low";
  return "Low";
}

export default async function FinancialDashboard(props: any) {
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

  // --- Category totals / prime cost
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

  // --- Targets (defaults; later we can store per-tenant)
  const TARGET_PRIME = 60; // % of net sales (lower better)
  const TARGET_FOOD = 30;
  const TARGET_LABOR = 25;

  // --- Category bars (6 buckets)
  const categoryBars = ["Food", "Labor", "Rent", "Utilities", "Marketing", "Misc"].map((k) => ({
    name: k,
    value: clamp2(byCat.get(k) || 0),
  }));

  // --- Daily trend line series
  const expenseByDay = new Map<string, number>();
  for (const r of expRows as any[]) {
    const day = String(r.occurred_at ?? "").slice(0, 10);
    expenseByDay.set(day, (expenseByDay.get(day) || 0) + Number(r.amount_usd || 0));
  }

  const dailyLine = salesRows.map((r: any) => {
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

  // --- Weekly trend (Financial owns “analysis”)
  type WeekAgg = { week: string; net_sales: number; expenses: number };
  const weekMap = new Map<string, WeekAgg>();

  for (const r of salesRows as any[]) {
    const day = String(r.day);
    const wk = startOfWeekMonFromISO(day);
    const exp = Number(expenseByDay.get(day) || 0);
    const ns = Number(r.net_sales || 0);

    const cur = weekMap.get(wk) ?? { week: wk, net_sales: 0, expenses: 0 };
    cur.net_sales += ns;
    cur.expenses += exp;
    weekMap.set(wk, cur);
  }

  const weeklyLine = Array.from(weekMap.values())
    .map((w) => ({
      key: `${w.week} → ${addDaysISO(w.week, 6)}`,
      net_sales: clamp2(w.net_sales),
      expenses: clamp2(w.expenses),
      profit: clamp2(w.net_sales - w.expenses),
    }))
    .sort((a, b) => String(a.key).localeCompare(String(b.key)));

  // --- Weekday net sales
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
    { label: "Food", formula: "SUM(expenses.amount_usd) WHERE category_norm = 'Food'" },
    { label: "Labor", formula: "SUM(expenses.amount_usd) WHERE category_norm = 'Labor'" },
    { label: "Prime Cost", formula: "Food + Labor", note: "A common restaurant metric." },
    { label: "Food %", formula: "Food / Net Sales" },
    { label: "Labor %", formula: "Labor / Net Sales" },
    { label: "Prime %", formula: "(Food + Labor) / Net Sales" },
    { label: "Targets", formula: "Defaults: Prime 60%, Food 30%, Labor 25% (lower is better)" },
    { label: "Weekly Trend", formula: "Aggregate daily totals into Monday-start weeks" },
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

      {/* Targets vs Actual (Financial = health) */}
      <div className="rounded border border-neutral-800 p-4 mb-4">
        <div className="font-semibold mb-2">Targets vs Actual (quick health check)</div>
        <div className="text-sm opacity-70 mb-3">
          Defaults are conservative. Later we can let each tenant set their own targets.
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded border border-neutral-800 bg-neutral-950/40 p-3">
            <div className="text-sm opacity-80">Prime %</div>
            <div className="text-xl font-semibold mt-1">{clampPct(primePct)}%</div>
            <div className="text-sm opacity-70 mt-1">
              Target ≤ {TARGET_PRIME}% • {statusLabel(primePct, TARGET_PRIME, "max")}
            </div>
          </div>

          <div className="rounded border border-neutral-800 bg-neutral-950/40 p-3">
            <div className="text-sm opacity-80">Food %</div>
            <div className="text-xl font-semibold mt-1">{clampPct(foodPct)}%</div>
            <div className="text-sm opacity-70 mt-1">
              Target ≤ {TARGET_FOOD}% • {statusLabel(foodPct, TARGET_FOOD, "max")}
            </div>
          </div>

          <div className="rounded border border-neutral-800 bg-neutral-950/40 p-3">
            <div className="text-sm opacity-80">Labor %</div>
            <div className="text-xl font-semibold mt-1">{clampPct(laborPct)}%</div>
            <div className="text-sm opacity-70 mt-1">
              Target ≤ {TARGET_LABOR}% • {statusLabel(laborPct, TARGET_LABOR, "max")}
            </div>
          </div>
        </div>
      </div>

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
          <div className="text-sm opacity-70 mb-4">Daily trend for detail-level analysis.</div>
          <SalesExpensesProfitLine data={dailyLine} />
        </div>

        <div className="rounded border border-neutral-800 p-4">
          <div className="font-semibold mb-2">Expenses by Category</div>
          <div className="text-sm opacity-70 mb-4">
            Categories are normalized into: Food, Labor, Rent, Utilities, Marketing, Misc.
          </div>
          <CategoryBars data={categoryBars} />
        </div>

        <div className="rounded border border-neutral-800 p-4 lg:col-span-2">
          <div className="font-semibold mb-2">Weekly Trend (summary)</div>
          <div className="text-sm opacity-70 mb-4">
            Weekly totals help you spot patterns without daily noise.
          </div>
          <SalesExpensesProfitLine data={weeklyLine} />
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
