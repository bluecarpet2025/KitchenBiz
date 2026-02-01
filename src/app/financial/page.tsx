// src/app/financial/page.tsx
import "server-only";
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { effectiveTenantId } from "@/lib/effective-tenant";
import { effectivePlan } from "@/lib/plan";

/* ----------------------------- helpers ----------------------------- */
const pad2 = (n: number) => String(n).padStart(2, "0");

function isoDateUTC(d: Date) {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function ymUTC(d: Date) {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}

function startOfMonthUTC(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function startOfNextMonthUTC(d: Date) {
  const s = startOfMonthUTC(d);
  s.setUTCMonth(s.getUTCMonth() + 1);
  return s;
}

function addMonthsUTC(d: Date, n: number) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCMonth(x.getUTCMonth() + n);
  return x;
}

function addMonthsYM(ymStr: string, delta: number) {
  const [y, m] = ymStr.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  d.setUTCMonth(d.getUTCMonth() + delta);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}

function monthsBetween(startYM: string, endYMExcl: string) {
  const [sy, sm] = startYM.split("-").map(Number);
  const [ey, em] = endYMExcl.split("-").map(Number);
  return (ey - sy) * 12 + (em - sm);
}

const fmtUSD = (n: number) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(Number(n) || 0);

const fmtPct = (n: number) => `${Math.round((Number.isFinite(n) ? n : 0) * 100)}%`;

const safeDiv = (a: number, b: number) => (b ? a / b : 0);

type SalesMonthRow = { month: string; revenue: number; orders: number };
type IncomeCats = {
  Food: number;
  Beverage: number;
  Labor: number;
  Rent: number;
  Utilities: number;
  Marketing: number;
  Misc: number;
};

type IncomeRow = {
  month: string;
  sales: number;
  food: number;
  beverage: number;
  labor: number;
  rent: number;
  utilities: number;
  marketing: number;
  misc: number;
  cost_of_revenue: number;
  operating_expenses: number;
  gross_profit: number;
  net_income: number;
};

function catKey(c: string | null): keyof IncomeCats {
  const k = String(c ?? "").trim().toLowerCase();

  // IMPORTANT: these map to your statement rows
  // - Food/Beverage are "cost of revenue"
  // - Everything else is "operating expenses"
  if (k === "food" || k === "food/beverage" || k === "food & beverage" || k === "food and beverage") return "Food";
  if (k === "beverage" || k === "drinks") return "Beverage";
  if (k === "labor") return "Labor";
  if (k === "rent") return "Rent";
  if (k === "utilities") return "Utilities";
  if (k === "marketing") return "Marketing";
  return "Misc";
}

function emptyCats(): IncomeCats {
  return { Food: 0, Beverage: 0, Labor: 0, Rent: 0, Utilities: 0, Marketing: 0, Misc: 0 };
}

function sumCats(c: IncomeCats) {
  return Object.values(c).reduce((a, b) => a + b, 0);
}

function Tip({ label, tip }: { label: string; tip: string }) {
  return (
    <span className="inline-flex items-center gap-1" title={tip}>
      <span>{label}</span>
      <span className="text-[10px] opacity-60">ⓘ</span>
    </span>
  );
}

/* =============================== PAGE =============================== */
/** Use `any` to satisfy Next's PageProps constraint; normalize inside */
export default async function FinancialPage(props: any) {
  // Normalize search params for both Next 15 (Promise) and older (object)
  const spRaw =
    (props?.searchParams && typeof (props.searchParams as any)?.then === "function"
      ? await (props.searchParams as Promise<Record<string, string>>)
      : props?.searchParams) ?? {};
  const sp = (spRaw ?? {}) as Record<string, string>;

  const supabase = await createServerClient();
  const { tenantId } = await effectiveTenantId();
  if (!tenantId) {
    return (
      <main className="max-w-6xl mx-auto px-4 py-6">
        <div className="text-xl font-semibold mb-4">Financials</div>
        <div className="text-sm opacity-70">Sign in to view financials.</div>
      </main>
    );
  }

  const plan = await effectivePlan();
  const isStarter = plan === "starter";

  // Starter cutoff: rolling last 3 months (UTC)
  const now = new Date();
  const cutoff = addMonthsUTC(startOfMonthUTC(now), -3);
  const cutoffIso = isoDateUTC(cutoff);

  // Range selection:
  // - If user provides start/end explicitly -> treat as custom
  // - Else if range param -> compute start/end
  // - Else default to YTD
  const isValidIso = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

  let range = (sp.range ?? "").trim().toLowerCase();
  const hasExplicit = isValidIso(sp.start ?? "") && isValidIso(sp.end ?? "");
  if (hasExplicit) range = ""; // custom overrides pills

  // Defaults (YTD)
  const defaultStart = `${now.getUTCFullYear()}-01-01`;
  const defaultEnd = isoDateUTC(startOfNextMonthUTC(now)); // end is exclusive, start of next month

  // For ALL range we need to find min/max month with any data.
  // We'll do that before deciding start/end if range === "all".
  let allMinYM: string | null = null;
  let allMaxYM: string | null = null;

  if (range === "all") {
    const [
      { data: sMin },
      { data: sMax },
      { data: eMin },
      { data: eMax },
    ] = await Promise.all([
      supabase
        .from("v_sales_month_totals")
        .select("month")
        .eq("tenant_id", tenantId)
        .order("month", { ascending: true })
        .limit(1),
      supabase
        .from("v_sales_month_totals")
        .select("month")
        .eq("tenant_id", tenantId)
        .order("month", { ascending: false })
        .limit(1),
      supabase
        .from("expenses")
        .select("occurred_at")
        .eq("tenant_id", tenantId)
        .order("occurred_at", { ascending: true })
        .limit(1),
      supabase
        .from("expenses")
        .select("occurred_at")
        .eq("tenant_id", tenantId)
        .order("occurred_at", { ascending: false })
        .limit(1),
    ]);

    const salesMinYM = (sMin?.[0] as any)?.month ? String((sMin![0] as any).month) : null;
    const salesMaxYM = (sMax?.[0] as any)?.month ? String((sMax![0] as any).month) : null;

    const expMinYM = (eMin?.[0] as any)?.occurred_at ? ymUTC(new Date(String((eMin![0] as any).occurred_at))) : null;
    const expMaxYM = (eMax?.[0] as any)?.occurred_at ? ymUTC(new Date(String((eMax![0] as any).occurred_at))) : null;

    const mins = [salesMinYM, expMinYM].filter(Boolean) as string[];
    const maxs = [salesMaxYM, expMaxYM].filter(Boolean) as string[];

    allMinYM = mins.length ? mins.sort()[0] : null;
    allMaxYM = maxs.length ? maxs.sort()[maxs.length - 1] : null;
  }

  const computeRange = (): { startIso: string; endIso: string } => {
    if (hasExplicit) return { startIso: sp.start!, endIso: sp.end! };

    // For end, we use start of next month (exclusive) so "YTD on 1/31" includes only January.
    const end = startOfNextMonthUTC(now);
    const endIso = isoDateUTC(end);

    if (range === "1m") {
      const start = startOfMonthUTC(now);
      return { startIso: isoDateUTC(start), endIso };
    }
    if (range === "3m") {
      const start = addMonthsUTC(startOfMonthUTC(now), -2);
      return { startIso: isoDateUTC(start), endIso };
    }
    if (range === "6m") {
      const start = addMonthsUTC(startOfMonthUTC(now), -5);
      return { startIso: isoDateUTC(start), endIso };
    }
    if (range === "1y") {
      // trailing 12 months ending current month
      const start = addMonthsUTC(startOfMonthUTC(now), -11);
      return { startIso: isoDateUTC(start), endIso };
    }
    if (range === "all") {
      if (allMinYM && allMaxYM) {
        const startIso = `${allMinYM}-01`;
        const endYMExcl = addMonthsYM(allMaxYM, 1);
        const endIso = `${endYMExcl}-01`;
        return { startIso, endIso };
      }
      return { startIso: defaultStart, endIso: defaultEnd };
    }
    // default = YTD
    return { startIso: defaultStart, endIso: defaultEnd };
  };

  const { startIso: rawStartIso, endIso: rawEndIso } = computeRange();

  // Guard: ensure ISO formatting
  const startIso = isValidIso(rawStartIso) ? rawStartIso : defaultStart;
  const endIso = isValidIso(rawEndIso) ? rawEndIso : defaultEnd;

  const startMonth = startIso.slice(0, 7);
  const endMonthExcl = endIso.slice(0, 7); // exclusive

  // Month list [startMonth ... <endMonthExcl)
  const months: string[] = [];
  for (let m = startMonth; m < endMonthExcl; m = addMonthsYM(m, 1)) {
    months.push(m);
    if (months.length > 180) break; // safety
  }

  // Starter: only query >= cutoff, but keep the full month list and render old months as $0.
  const queryStartIso = isStarter && startIso < cutoffIso ? cutoffIso : startIso;
  const queryStartMonth = queryStartIso.slice(0, 7);

  /* ---------------------------- fetch sales ---------------------------- */
  let salesRows: SalesMonthRow[] = [];
  if (months.length) {
    const { data } = await supabase
      .from("v_sales_month_totals")
      .select("month, revenue, orders")
      .eq("tenant_id", tenantId)
      .gte("month", queryStartMonth)
      .lt("month", endMonthExcl)
      .order("month", { ascending: true });

    salesRows =
      (data ?? [])
        .map((r: any) => [String(r.month), Number(r.revenue ?? 0), Number(r.orders ?? 0)] as [string, number, number])
        .map(([month, revenue, orders]) => ({ month, revenue, orders })) ?? [];
  }

  const salesByMonth = new Map(salesRows.map((r) => [r.month, r.revenue]));
  const ordersByMonth = new Map(salesRows.map((r) => [r.month, r.orders]));

  /* -------------------------- fetch expenses -------------------------- */
  const { data: expRows } = await supabase
    .from("expenses")
    .select("occurred_at, amount_usd, category")
    .eq("tenant_id", tenantId)
    .gte("occurred_at", `${queryStartIso}T00:00:00Z`)
    .lt("occurred_at", `${endIso}T00:00:00Z`);

  const expByMonth = new Map<string, IncomeCats>();
  for (const r of expRows ?? []) {
    const dt = new Date((r as any).occurred_at);
    const k = `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}`;
    const c = catKey((r as any).category);
    const amt = Number((r as any).amount_usd || 0); // can be negative now (refunds/credits)
    if (!expByMonth.has(k)) expByMonth.set(k, emptyCats());
    expByMonth.get(k)![c] += amt;
  }

  /* --------------------------- build statement --------------------------- */
  const monthStartIso = (m: string) => `${m}-01`;

  const incomeRows: IncomeRow[] = months.map((m) => {
    const isLocked = isStarter && monthStartIso(m) < cutoffIso;

    const sales = isLocked ? 0 : Number(salesByMonth.get(m) || 0);
    const exp = isLocked ? emptyCats() : expByMonth.get(m) ?? emptyCats();

    const cost_of_revenue = exp.Food + exp.Beverage; // net (can be negative)
    const operating_expenses = exp.Labor + exp.Rent + exp.Utilities + exp.Marketing + exp.Misc; // net (can be negative)
    const gross_profit = sales - cost_of_revenue;
    const net_income = gross_profit - operating_expenses;

    return {
      month: m,
      sales,
      food: exp.Food,
      beverage: exp.Beverage,
      labor: exp.Labor,
      rent: exp.Rent,
      utilities: exp.Utilities,
      marketing: exp.Marketing,
      misc: exp.Misc,
      cost_of_revenue,
      operating_expenses,
      gross_profit,
      net_income,
    };
  });

  // Selected period totals
  const selSales = incomeRows.reduce((a, r) => a + r.sales, 0);
  const selOrders = months.reduce((a, m) => a + Number(ordersByMonth.get(m) || 0), 0);
  const selCats = incomeRows.reduce(
    (acc, r) => {
      acc.Food += r.food;
      acc.Beverage += r.beverage;
      acc.Labor += r.labor;
      acc.Rent += r.rent;
      acc.Utilities += r.utilities;
      acc.Marketing += r.marketing;
      acc.Misc += r.misc;
      return acc;
    },
    emptyCats()
  );

  const selNetExpenses = sumCats(selCats); // includes cost-of-revenue + operating expenses
  const selCostOfRev = selCats.Food + selCats.Beverage;
  const selOpEx = selCats.Labor + selCats.Rent + selCats.Utilities + selCats.Marketing + selCats.Misc;
  const selGrossProfit = selSales - selCostOfRev;
  const selNetIncome = selGrossProfit - selOpEx;

  const selAOV = safeDiv(selSales, selOrders);
  const selFoodPct = safeDiv(selCats.Food + selCats.Beverage, selSales);
  const selLaborPct = safeDiv(selCats.Labor, selSales);
  const selPrimePct = safeDiv(selCats.Food + selCats.Beverage + selCats.Labor, selSales);
  const selNetMargin = safeDiv(selNetIncome, selSales);

  // Prior period comparison (same month count)
  const spanMonths = monthsBetween(startMonth, endMonthExcl);
  const priorStartMonth = addMonthsYM(startMonth, -spanMonths);
  const priorEndMonthExcl = startMonth;

  // Query prior sales + expenses only if we have a meaningful span
  let priorSales = 0;
  let priorCats = emptyCats();

  if (spanMonths > 0) {
    const priorStartIso = `${priorStartMonth}-01`;
    const priorEndIso = `${priorEndMonthExcl}-01`;

    // apply starter cutoff to prior too (older months show $0)
    const priorQueryStartIso = isStarter && priorStartIso < cutoffIso ? cutoffIso : priorStartIso;
    const priorQueryStartMonth = priorQueryStartIso.slice(0, 7);

    const [{ data: ps }, { data: pe }] = await Promise.all([
      supabase
        .from("v_sales_month_totals")
        .select("month, revenue")
        .eq("tenant_id", tenantId)
        .gte("month", priorQueryStartMonth)
        .lt("month", priorEndMonthExcl),
      supabase
        .from("expenses")
        .select("occurred_at, amount_usd, category")
        .eq("tenant_id", tenantId)
        .gte("occurred_at", `${priorQueryStartIso}T00:00:00Z`)
        .lt("occurred_at", `${priorEndIso}T00:00:00Z`),
    ]);

    const pSalesMap = new Map((ps ?? []).map((r: any) => [String(r.month), Number(r.revenue ?? 0)]));
    // Build prior month list to enforce starter "locked months are 0"
    const priorMonths: string[] = [];
    for (let m = priorStartMonth; m < priorEndMonthExcl; m = addMonthsYM(m, 1)) {
      priorMonths.push(m);
      if (priorMonths.length > 180) break;
    }
    priorSales = priorMonths.reduce((a, m) => {
      const isLocked = isStarter && `${m}-01` < cutoffIso;
      return a + (isLocked ? 0 : Number(pSalesMap.get(m) || 0));
    }, 0);

    const tmp = new Map<string, IncomeCats>();
    for (const r of pe ?? []) {
      const dt = new Date((r as any).occurred_at);
      const m = `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}`;
      const isLocked = isStarter && `${m}-01` < cutoffIso;
      if (isLocked) continue;
      const c = catKey((r as any).category);
      const amt = Number((r as any).amount_usd || 0);
      if (!tmp.has(m)) tmp.set(m, emptyCats());
      tmp.get(m)![c] += amt;
    }
    // Sum all prior cats
    priorCats = Array.from(tmp.values()).reduce((acc, v) => {
      acc.Food += v.Food;
      acc.Beverage += v.Beverage;
      acc.Labor += v.Labor;
      acc.Rent += v.Rent;
      acc.Utilities += v.Utilities;
      acc.Marketing += v.Marketing;
      acc.Misc += v.Misc;
      return acc;
    }, emptyCats());
  }

  const priorNetExpenses = sumCats(priorCats);
  const priorCostOfRev = priorCats.Food + priorCats.Beverage;
  const priorOpEx = priorCats.Labor + priorCats.Rent + priorCats.Utilities + priorCats.Marketing + priorCats.Misc;
  const priorGrossProfit = priorSales - priorCostOfRev;
  const priorNetIncome = priorGrossProfit - priorOpEx;

  const delta = selNetIncome - priorNetIncome;
  const deltaPct = priorNetIncome !== 0 ? delta / Math.abs(priorNetIncome) : 0;

  const q = new URLSearchParams({ start: startIso, end: endIso }).toString();

  const pill = (key: string, label: string) => {
    const active = !hasExplicit && range === key;
    return (
      <a
        href={`/financial?range=${encodeURIComponent(key)}`}
        className={`px-2 py-1 rounded-full border text-xs ${
          active ? "border-emerald-500 text-emerald-200 bg-emerald-900/10" : "border-neutral-800 hover:bg-neutral-900"
        }`}
      >
        {label}
      </a>
    );
  };

  // Starter notice
  const starterNotice = (
    <div className="mb-3 text-xs rounded border border-amber-600/40 bg-amber-900/10 px-3 py-2 text-amber-200">
      Starter shows last 3 months (older periods display $0).{" "}
      <Link href="/profile" className="underline">
        Upgrade to Basic
      </Link>{" "}
      for full history.
    </div>
  );

  return (
    <main className="max-w-6xl mx-auto px-4 py-6">
      {/* Header row: title + range pills + actions */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <div className="text-xl font-semibold mr-2">Financials</div>

        <div className="flex flex-wrap items-center gap-2">
          {pill("1m", "1M")}
          {pill("3m", "3M")}
          {pill("6m", "6M")}
          {pill("ytd", "YTD")}
          {pill("1y", "1Y")}
          {pill("all", "ALL")}
          {hasExplicit && <span className="text-xs opacity-60 ml-1">Custom</span>}
        </div>

        <div className="flex-1" />

        <div className="flex flex-wrap items-center gap-2">
          <a href={`/api/accounting/export?${q}`} className="border rounded px-3 h-10 flex items-center hover:bg-neutral-900">
            Download Tax Pack
          </a>
          <Link href="/sales" className="border rounded px-3 h-10 flex items-center hover:bg-neutral-900">
            Sales details
          </Link>
          <Link href="/expenses" className="border rounded px-3 h-10 flex items-center hover:bg-neutral-900">
            Expenses details
          </Link>
        </div>
      </div>

      {/* Date range form row */}
      <div className="flex flex-wrap items-end gap-2 mb-3">
        <form action="/financial" className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col">
            <label className="text-[11px] opacity-70 mb-1">Start (UTC)</label>
            <input
              type="date"
              name="start"
              defaultValue={startIso}
              className="border rounded px-2 h-10 bg-transparent"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-[11px] opacity-70 mb-1">End (UTC)</label>
            <input
              type="date"
              name="end"
              defaultValue={endIso}
              className="border rounded px-2 h-10 bg-transparent"
            />
          </div>
          <button className="border rounded px-4 h-10 hover:bg-neutral-900">Apply</button>
        </form>

        <div className="flex-1" />

        <div className="text-xs opacity-60">
          Note: refunds/credits should be entered as <b>negative</b> expenses (example: <code>-25.00</code>). Financials shows{" "}
          <b>net</b> expenses.
        </div>
      </div>

      {isStarter && starterNotice}

      {/* Big summary card (Yahoo-ish) */}
      <section className="border rounded-xl p-4">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Left: headline + comparison + KPI strip (fills the “empty space”) */}
          <div className="flex-1">
            <div className="text-[11px] opacity-70 tracking-wide">
              INCOME STATEMENT • {startMonth} → {addMonthsYM(endMonthExcl, -1)}
            </div>

            <div className="mt-2 flex items-end gap-3 flex-wrap">
              <div className="text-4xl font-semibold tabular-nums">{fmtUSD(selNetIncome)}</div>
              <div className={`text-sm tabular-nums ${delta < 0 ? "text-rose-300" : "text-emerald-300"}`}>
                {delta >= 0 ? "+" : ""}
                {fmtUSD(delta)} ({delta >= 0 ? "+" : ""}
                {fmtPct(deltaPct)})
              </div>
              <div className="text-xs opacity-70">
                vs prior period ({priorStartMonth} → {addMonthsYM(priorEndMonthExcl, -1)})
              </div>
            </div>

            {/* KPI strip */}
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
              <div className="border rounded-md px-3 py-2">
                <div className="text-[11px] opacity-70">
                  <Tip
                    label="Sales"
                    tip="Total revenue for the selected period."
                  />
                </div>
                <div className="font-medium tabular-nums">{fmtUSD(selSales)}</div>
              </div>
              <div className="border rounded-md px-3 py-2">
                <div className="text-[11px] opacity-70">
                  <Tip
                    label="Net expenses"
                    tip="Sum of all expenses for the period. Can be negative if refunds/credits exceed spending."
                  />
                </div>
                <div className="font-medium tabular-nums">{fmtUSD(selNetExpenses)}</div>
              </div>
              <div className="border rounded-md px-3 py-2">
                <div className="text-[11px] opacity-70">
                  <Tip
                    label="Gross profit"
                    tip="Sales minus Cost of Revenue (Food + Beverage)."
                  />
                </div>
                <div className="font-medium tabular-nums">{fmtUSD(selGrossProfit)}</div>
              </div>
              <div className="border rounded-md px-3 py-2">
                <div className="text-[11px] opacity-70">
                  <Tip
                    label="Net margin"
                    tip="Net income divided by sales."
                  />
                </div>
                <div className="font-medium tabular-nums">{fmtPct(selNetMargin)}</div>
              </div>
            </div>
          </div>

          {/* Right: key stats (with tooltips) */}
          <aside className="w-full lg:w-[320px] border rounded-xl p-3">
            <div className="text-sm font-medium mb-2">Key stats</div>

            <div className="space-y-1 text-sm">
              <div className="flex justify-between gap-2">
                <span className="opacity-80">
                  <Tip label="Sales" tip="Total revenue for the selected period." />
                </span>
                <span className="tabular-nums">{fmtUSD(selSales)}</span>
              </div>

              <div className="flex justify-between gap-2">
                <span className="opacity-80">
                  <Tip label="Net expenses" tip="Sum of all expenses (can be negative due to credits/refunds)." />
                </span>
                <span className="tabular-nums">{fmtUSD(selNetExpenses)}</span>
              </div>

              <div className="flex justify-between gap-2">
                <span className="opacity-80">
                  <Tip label="Net income" tip="Gross profit minus operating expenses." />
                </span>
                <span className="tabular-nums">{fmtUSD(selNetIncome)}</span>
              </div>

              <div className="border-t border-neutral-800 my-2" />

              <div className="flex justify-between gap-2">
                <span className="opacity-80">
                  <Tip label="Orders" tip="Total number of orders for the selected period." />
                </span>
                <span className="tabular-nums">{selOrders}</span>
              </div>

              <div className="flex justify-between gap-2">
                <span className="opacity-80">
                  <Tip label="AOV" tip="Average Order Value = Sales ÷ Orders." />
                </span>
                <span className="tabular-nums">{fmtUSD(selAOV)}</span>
              </div>

              <div className="flex justify-between gap-2">
                <span className="opacity-80">
                  <Tip label="Food %" tip="Food + Beverage as a % of Sales (cost of revenue %)." />
                </span>
                <span className="tabular-nums">{fmtPct(selFoodPct)}</span>
              </div>

              <div className="flex justify-between gap-2">
                <span className="opacity-80">
                  <Tip label="Labor %" tip="Labor as a % of Sales." />
                </span>
                <span className="tabular-nums">{fmtPct(selLaborPct)}</span>
              </div>

              <div className="flex justify-between gap-2">
                <span className="opacity-80">
                  <Tip label="Prime %" tip="Prime cost % = (Food + Beverage + Labor) ÷ Sales." />
                </span>
                <span className="tabular-nums">{fmtPct(selPrimePct)}</span>
              </div>

              <div className="flex justify-between gap-2">
                <span className="opacity-80">
                  <Tip label="Net margin" tip="Net income ÷ Sales." />
                </span>
                <span className="tabular-nums">{fmtPct(selNetMargin)}</span>
              </div>
            </div>
          </aside>
        </div>
      </section>

      {/* Income Statement table (Yahoo-ish breakdown) */}
      <section className="border rounded-xl mt-4 overflow-x-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="text-sm opacity-90 font-medium">Income Statement</div>
          <div className="text-xs opacity-60">
            Columns are months • Values in USD • Net expenses may be negative
          </div>
        </div>

        {/* Table */}
        <table className="min-w-[1100px] w-full text-sm">
          <thead className="opacity-80">
            <tr className="bg-neutral-900/40">
              <th className="text-left font-normal px-3 py-2 w-[220px]">Breakdown</th>
              {months.map((m) => (
                <th key={m} className="text-right font-normal px-3 py-2 tabular-nums">
                  {m}
                </th>
              ))}
              <th className="text-right font-normal px-3 py-2 tabular-nums">Total</th>
              <th className="text-right font-normal px-3 py-2 tabular-nums">% Sales</th>
            </tr>
          </thead>

          <tbody>
            {(() => {
              const totalSales = selSales;

              const row = (
                label: React.ReactNode,
                perMonth: (r: IncomeRow) => number,
                total: number,
                pctOfSales: number | null,
                opts?: { bold?: boolean; indent?: boolean }
              ) => (
                <tr className="border-t">
                  <td className={`px-3 py-2 ${opts?.bold ? "font-medium" : ""}`}>
                    {opts?.indent ? <span className="opacity-60">— </span> : null}
                    {label}
                  </td>
                  {incomeRows.map((r) => (
                    <td key={`${label}-${r.month}`} className="px-3 py-2 text-right tabular-nums">
                      {fmtUSD(perMonth(r))}
                    </td>
                  ))}
                  <td className={`px-3 py-2 text-right tabular-nums ${opts?.bold ? "font-medium" : ""}`}>{fmtUSD(total)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {pctOfSales === null ? "—" : fmtPct(pctOfSales)}
                  </td>
                </tr>
              );

              return (
                <>
                  {row(
                    <Tip label="Total Revenue" tip="Total sales (revenue) for each month." />,
                    (r) => r.sales,
                    selSales,
                    null,
                    { bold: true }
                  )}

                  {row(
                    <Tip label="Cost of Revenue" tip="Direct cost to produce sales (Food + Beverage)." />,
                    (r) => r.cost_of_revenue,
                    selCostOfRev,
                    safeDiv(selCostOfRev, totalSales),
                    { bold: true }
                  )}

                  {row(
                    <Tip label="Food" tip="Food ingredients / supplies tied directly to sales." />,
                    (r) => r.food,
                    selCats.Food,
                    safeDiv(selCats.Food, totalSales),
                    { indent: true }
                  )}

                  {row(
                    <Tip label="Beverage" tip="Drinks / beverage inputs tied directly to sales." />,
                    (r) => r.beverage,
                    selCats.Beverage,
                    safeDiv(selCats.Beverage, totalSales),
                    { indent: true }
                  )}

                  {row(
                    <Tip label="Gross Profit" tip="Sales minus Cost of Revenue." />,
                    (r) => r.gross_profit,
                    selGrossProfit,
                    safeDiv(selGrossProfit, totalSales),
                    { bold: true }
                  )}

                  {row(
                    <Tip label="Operating Expenses" tip="Expenses required to operate (Labor, Rent, Utilities, Marketing, Misc)." />,
                    (r) => r.operating_expenses,
                    selOpEx,
                    safeDiv(selOpEx, totalSales),
                    { bold: true }
                  )}

                  {row(
                    <Tip label="Labor" tip="Wages, contractor pay, and labor-related expense." />,
                    (r) => r.labor,
                    selCats.Labor,
                    safeDiv(selCats.Labor, totalSales),
                    { indent: true }
                  )}

                  {row(
                    <Tip label="Rent" tip="Rent, lease, commissary, or kitchen space fees." />,
                    (r) => r.rent,
                    selCats.Rent,
                    safeDiv(selCats.Rent, totalSales),
                    { indent: true }
                  )}

                  {row(
                    <Tip label="Utilities" tip="Gas, electric, water, internet, etc." />,
                    (r) => r.utilities,
                    selCats.Utilities,
                    safeDiv(selCats.Utilities, totalSales),
                    { indent: true }
                  )}

                  {row(
                    <Tip label="Marketing" tip="Ads, promos, events, and marketing spend." />,
                    (r) => r.marketing,
                    selCats.Marketing,
                    safeDiv(selCats.Marketing, totalSales),
                    { indent: true }
                  )}

                  {row(
                    <Tip label="Misc" tip="Everything else (repairs, fees, subscriptions, supplies not in food, etc.)." />,
                    (r) => r.misc,
                    selCats.Misc,
                    safeDiv(selCats.Misc, totalSales),
                    { indent: true }
                  )}

                  {row(
                    <Tip label="Net Income" tip="Gross profit minus operating expenses." />,
                    (r) => r.net_income,
                    selNetIncome,
                    safeDiv(selNetIncome, totalSales),
                    { bold: true }
                  )}
                </>
              );
            })()}
          </tbody>
        </table>
      </section>
    </main>
  );
}
