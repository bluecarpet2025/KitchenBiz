import "server-only";
import DashboardControls from "../_components/DashboardControls";
import DefinitionsDrawer from "../_components/DefinitionsDrawer";
import KpiCard from "../_components/KpiCard";
import { resolveRange } from "../_components/dateRange";
import { createServerClient } from "@/lib/supabase/server";
import { SalesExpensesProfitLine, CategoryBars } from "../_components/Charts";

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(Number(n) || 0);

function clamp2(n: number) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export default async function ExecutiveDashboard(props: any) {
  const sp = (await props?.searchParams) ?? props?.searchParams ?? {};
  const range = resolveRange(sp);

  const supabase = await createServerClient();

  // --- Pull sales day totals and filter to range (server-side filtering)
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

  // Expenses: use normalized categories view + filter by range in JS
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

  // occurred_at is timestamp; compare by YYYY-MM-DD
  const expRows = (expNorm ?? []).filter((r: any) => {
    const day = String(r.occurred_at ?? "").slice(0, 10);
    return day && day >= range.start && day < range.end;
  });

  const totalExpenses = expRows.reduce((a: number, r: any) => a + Number(r.amount_usd || 0), 0);
  const profit = netSales - totalExpenses;
  const marginPct = netSales > 0 ? (profit / netSales) * 100 : 0;
  const aov = orders > 0 ? netSales / orders : 0;

  // Category totals (6 bucket bars)
  const byCat = new Map<string, number>();
  for (const r of expRows as any[]) {
    const k = String(r.category_norm ?? "Misc");
    byCat.set(k, (byCat.get(k) || 0) + Number(r.amount_usd || 0));
  }
  const categoryBars = ["Food", "Labor", "Rent", "Utilities", "Marketing", "Misc"].map((k) => ({
    name: k,
    value: clamp2(byCat.get(k) || 0),
  }));

  // Build line series (daily) for chart
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

  const definitions = [
    { label: "Gross Sales", formula: "SUM(qty * unit_price)", note: "Total before discounts and taxes." },
    { label: "Discounts", formula: "SUM(discount)", note: "All discounts applied to sales." },
    { label: "Taxes", formula: "SUM(tax)", note: "Sales tax collected (not revenue)." },
    { label: "Net Sales", formula: "SUM(total)", note: "This is the main sales number used in dashboards." },
    { label: "Expenses", formula: "SUM(expenses.amount_usd)", note: "Sum of expenses in the selected date range." },
    { label: "Profit", formula: "Net Sales - Expenses" },
    { label: "Margin %", formula: "Profit / Net Sales" },
    { label: "Orders", formula: "COUNT(DISTINCT sales_orders.id)" },
    { label: "AOV", formula: "Net Sales / Orders", note: "Average order value." },
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <KpiCard label="Net Sales" value={fmtCurrency(netSales)} hint="Revenue after discounts/tax line handling." formula="SUM(total)" />
        <KpiCard label="Expenses" value={fmtCurrency(totalExpenses)} hint="Operating expenses in this range." formula="SUM(expenses.amount_usd)" />
        <KpiCard label="Profit" value={fmtCurrency(profit)} hint="Net Sales minus Expenses." formula="Net Sales - Expenses" />
        <KpiCard label="Margin %" value={`${clamp2(marginPct)}%`} hint="Profit divided by Net Sales." formula="Profit / Net Sales" />
        <KpiCard label="Orders" value={String(orders)} hint="Unique orders in this range." formula="COUNT(DISTINCT orders)" />
        <KpiCard label="AOV" value={fmtCurrency(aov)} hint="Average order value." formula="Net Sales / Orders" />
        <KpiCard label="Gross Sales" value={fmtCurrency(grossSales)} hint="Before discounts and taxes." formula="SUM(qty * unit_price)" />
        <KpiCard label="Discounts" value={fmtCurrency(discounts)} hint="Total discounts given." formula="SUM(discount)" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded border border-neutral-800 p-4">
          <div className="font-semibold mb-2">Net Sales vs Expenses vs Profit (daily)</div>
          <div className="text-sm opacity-70 mb-4">Shows trend over the selected range.</div>
          <SalesExpensesProfitLine data={lineData} />
        </div>

        <div className="rounded border border-neutral-800 p-4">
          <div className="font-semibold mb-2">Expenses by Category</div>
          <div className="text-sm opacity-70 mb-4">
            Categories are normalized into: Food, Labor, Rent, Utilities, Marketing, Misc.
          </div>
          <CategoryBars data={categoryBars} />
        </div>
      </div>
    </div>
  );
}
