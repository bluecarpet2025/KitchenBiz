// src/app/financial/page.tsx
import "server-only";
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { effectiveTenantId } from "@/lib/effective-tenant";
import { effectivePlan } from "@/lib/plan";

/* ----------------------------- helpers ----------------------------- */
const pad2 = (n: number) => String(n).padStart(2, "0");
const fmtUSD = (n: number) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(Number(n) || 0);

function ym(d: Date) {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}
function firstOfMonthUTC(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
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
  return ym(d);
}
function isoDate(d: Date) {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}
function monthStartIso(ymStr: string) {
  return `${ymStr}-01`;
}
function clampIsoDate(str: string | undefined, fallback: string) {
  return str && /^\d{4}-\d{2}-\d{2}$/.test(str) ? str : fallback;
}
function toNum(x: any) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}
function pct(n: number) {
  if (!Number.isFinite(n)) return "0%";
  return `${Math.round(n * 100)}%`;
}

type SalesMonthRow = { month: string; revenue: number; orders: number };
type ExpenseBucket = { Food: number; Beverage: number; Labor: number; Rent: number; Utilities: number; Marketing: number; Misc: number };

type Period = "monthly" | "quarterly" | "annual";
type ViewMode = "expanded" | "compact";

function periodKeyFromMonth(month: string, period: Period) {
  // month: YYYY-MM
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  if (period === "monthly") return month;
  if (period === "annual") return String(y);
  // quarterly
  const q = Math.floor((m - 1) / 3) + 1;
  return `${y}-Q${q}`;
}

function periodLabel(key: string, period: Period) {
  if (period === "monthly") return key;
  if (period === "annual") return key;
  // quarterly: YYYY-Q#
  return key;
}

function isTruthyParam(v: string | undefined) {
  return v === "1" || v === "true" || v === "yes";
}

function Info({ text }: { text: string }) {
  return (
    <span
      title={text}
      className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full border border-neutral-600 text-[10px] opacity-70 hover:opacity-100 cursor-help"
      aria-label={text}
    >
      i
    </span>
  );
}

function buildHref(base: string, params: Record<string, string>) {
  const u = new URLSearchParams(params);
  return `${base}?${u.toString()}`;
}

function niceRangeLabel(kind: string) {
  if (kind === "1m") return "1M";
  if (kind === "3m") return "3M";
  if (kind === "6m") return "6M";
  if (kind === "ytd") return "YTD";
  if (kind === "1y") return "1Y";
  if (kind === "all") return "ALL";
  return kind.toUpperCase();
}

/* =============================== PAGE =============================== */
/** Use `any` to satisfy Next's PageProps constraint; normalize inside */
export default async function FinancialPage(props: any) {
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
  const cutoff = addMonthsUTC(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())), -3);
  const cutoffIso = isoDate(cutoff);

  // Determine latest/earliest data months (to make ALL work as expected)
  // Sales month bounds
  const [{ data: salesLatest }, { data: salesEarliest }] = await Promise.all([
    supabase
      .from("v_sales_month_totals")
      .select("month")
      .eq("tenant_id", tenantId)
      .order("month", { ascending: false })
      .limit(1),
    supabase
      .from("v_sales_month_totals")
      .select("month")
      .eq("tenant_id", tenantId)
      .order("month", { ascending: true })
      .limit(1),
  ]);

  // Expenses date bounds
  const [{ data: expLatest }, { data: expEarliest }] = await Promise.all([
    supabase
      .from("expenses")
      .select("occurred_at")
      .eq("tenant_id", tenantId)
      .order("occurred_at", { ascending: false })
      .limit(1),
    supabase
      .from("expenses")
      .select("occurred_at")
      .eq("tenant_id", tenantId)
      .order("occurred_at", { ascending: true })
      .limit(1),
  ]);

  const salesLatestMonth = salesLatest?.[0]?.month ? String(salesLatest[0].month) : null;
  const salesEarliestMonth = salesEarliest?.[0]?.month ? String(salesEarliest[0].month) : null;

  const expLatestMonth = expLatest?.[0]?.occurred_at ? ym(new Date(String(expLatest[0].occurred_at))) : null;
  const expEarliestMonth = expEarliest?.[0]?.occurred_at ? ym(new Date(String(expEarliest[0].occurred_at))) : null;

  const latestMonth = [salesLatestMonth, expLatestMonth].filter(Boolean).sort().slice(-1)[0] ?? ym(now);
  const earliestMonth = [salesEarliestMonth, expEarliestMonth].filter(Boolean).sort().slice(0, 1)[0] ?? ym(now);

  // Preset selection
  const preset = (sp.preset ?? "").toLowerCase();

  // Default: YTD (but only through current month)
  const startOfThisMonth = firstOfMonthUTC(now);
  const startOfNextMonth = firstOfMonthUTC(addMonthsUTC(startOfThisMonth, 1));

  const defaultStart = `${now.getUTCFullYear()}-01-01`;
  const defaultEnd = isoDate(startOfNextMonth); // exclusive end boundary as ISO date

  let startIso = clampIsoDate(sp.start, defaultStart);
  let endIso = clampIsoDate(sp.end, defaultEnd);

  // Apply presets (end is exclusive, at start of next month)
  if (preset === "ytd") {
    startIso = `${now.getUTCFullYear()}-01-01`;
    endIso = isoDate(startOfNextMonth);
  } else if (preset === "1y") {
    const end = startOfNextMonth;
    const start = firstOfMonthUTC(addMonthsUTC(end, -12));
    startIso = isoDate(start);
    endIso = isoDate(end);
  } else if (preset === "6m") {
    const end = startOfNextMonth;
    const start = firstOfMonthUTC(addMonthsUTC(end, -6));
    startIso = isoDate(start);
    endIso = isoDate(end);
  } else if (preset === "3m") {
    const end = startOfNextMonth;
    const start = firstOfMonthUTC(addMonthsUTC(end, -3));
    startIso = isoDate(start);
    endIso = isoDate(end);
  } else if (preset === "1m") {
    const end = startOfNextMonth;
    const start = firstOfMonthUTC(addMonthsUTC(end, -1));
    startIso = isoDate(start);
    endIso = isoDate(end);
  } else if (preset === "all") {
    // ALL = all months with data, ending at month after latest month
    const [y, m] = latestMonth.split("-").map(Number);
    const end = new Date(Date.UTC(y, m - 1, 1));
    const endExcl = firstOfMonthUTC(addMonthsUTC(end, 1));
    startIso = `${earliestMonth}-01`;
    endIso = isoDate(endExcl);
  }

  // Period & view controls
  const period = (sp.period as Period) || "monthly";
  const view = (sp.view as ViewMode) || "expanded";
  const expCogs = sp.cogs ? isTruthyParam(sp.cogs) : true;
  const expOpex = sp.opex ? isTruthyParam(sp.opex) : true;

  // Build month range [startMonth .. < endMonthExcl)
  const startMonth = startIso.slice(0, 7);
  const endMonthExcl = endIso.slice(0, 7);

  const months: string[] = [];
  for (let m = startMonth; m < endMonthExcl; m = addMonthsYM(m, 1)) {
    months.push(m);
    if (months.length > 240) break;
  }

  // For Starter: only query >= cutoff, but keep the full month list and render locked months as $0.
  const queryStartIso = isStarter ? (startIso > cutoffIso ? startIso : cutoffIso) : startIso;
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
        .map((r: any) => [String(r.month), toNum(r.revenue), toNum(r.orders)] as [string, number, number])
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

  function catKey(c: string | null): keyof ExpenseBucket {
    const k = String(c ?? "").trim().toLowerCase();
    if (k === "food") return "Food";
    if (k === "beverage") return "Beverage";
    if (k === "labor") return "Labor";
    if (k === "rent") return "Rent";
    if (k === "utilities") return "Utilities";
    if (k === "marketing") return "Marketing";
    return "Misc";
  }

  const expByMonth = new Map<string, ExpenseBucket>();
  for (const r of expRows ?? []) {
    const dt = new Date((r as any).occurred_at);
    const k = `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}`;
    const c = catKey((r as any).category);
    const amt = toNum((r as any).amount_usd);
    if (!expByMonth.has(k)) expByMonth.set(k, { Food: 0, Beverage: 0, Labor: 0, Rent: 0, Utilities: 0, Marketing: 0, Misc: 0 });
    expByMonth.get(k)![c] += amt; // can be negative (refund/credit)
  }

  /* ----------------------- lock + normalize rows ----------------------- */
  const lockedMonth = (m: string) => isStarter && monthStartIso(m) < cutoffIso;

  // Aggregate into periods
  type Agg = {
    key: string; // period key
    sales: number;
    orders: number;
    exp: ExpenseBucket;
  };

  const aggMap = new Map<string, Agg>();

  for (const m of months) {
    const key = periodKeyFromMonth(m, period);
    if (!aggMap.has(key)) {
      aggMap.set(key, {
        key,
        sales: 0,
        orders: 0,
        exp: { Food: 0, Beverage: 0, Labor: 0, Rent: 0, Utilities: 0, Marketing: 0, Misc: 0 },
      });
    }
    const a = aggMap.get(key)!;
    const isLocked = lockedMonth(m);
    const sales = isLocked ? 0 : toNum(salesByMonth.get(m));
    const orders = isLocked ? 0 : toNum(ordersByMonth.get(m));
    const exp = isLocked ? { Food: 0, Beverage: 0, Labor: 0, Rent: 0, Utilities: 0, Marketing: 0, Misc: 0 } : (expByMonth.get(m) ?? { Food: 0, Beverage: 0, Labor: 0, Rent: 0, Utilities: 0, Marketing: 0, Misc: 0 });

    a.sales += sales;
    a.orders += orders;
    a.exp.Food += exp.Food;
    a.exp.Beverage += exp.Beverage;
    a.exp.Labor += exp.Labor;
    a.exp.Rent += exp.Rent;
    a.exp.Utilities += exp.Utilities;
    a.exp.Marketing += exp.Marketing;
    a.exp.Misc += exp.Misc;
  }

  const periods = Array.from(aggMap.values()).sort((a, b) => (a.key < b.key ? -1 : 1));

  // Selected period totals
  const selSales = periods.reduce((s, p) => s + p.sales, 0);
  const selOrders = periods.reduce((s, p) => s + p.orders, 0);
  const selExp = periods.reduce(
    (acc, p) => {
      acc.Food += p.exp.Food;
      acc.Beverage += p.exp.Beverage;
      acc.Labor += p.exp.Labor;
      acc.Rent += p.exp.Rent;
      acc.Utilities += p.exp.Utilities;
      acc.Marketing += p.exp.Marketing;
      acc.Misc += p.exp.Misc;
      return acc;
    },
    { Food: 0, Beverage: 0, Labor: 0, Rent: 0, Utilities: 0, Marketing: 0, Misc: 0 } as ExpenseBucket
  );
  const selNetExpenses = Object.values(selExp).reduce((a, b) => a + b, 0);
  const selCOGS = selExp.Food + selExp.Beverage;
  const selGrossProfit = selSales - selCOGS;
  const selOpex = selNetExpenses; // with our current model, all expenses are op-ex; COGS is derived from Food/Beverage buckets
  const selNetIncome = selSales - selNetExpenses;

  const selAOV = selOrders > 0 ? selSales / selOrders : 0;
  const selFoodPct = selSales > 0 ? selExp.Food / selSales : 0;
  const selLaborPct = selSales > 0 ? selExp.Labor / selSales : 0;
  const selPrimePct = selSales > 0 ? (selExp.Food + selExp.Beverage + selExp.Labor) / selSales : 0;
  const selNetMargin = selSales > 0 ? selNetIncome / selSales : 0;

  /* ------------------------ Prior period (variance) ------------------------ */
  // Prior period is same length, immediately preceding startIso.
  const selLenMonths = Math.max(1, months.length);
  const priorEnd = new Date(`${startIso}T00:00:00Z`);
  const priorStart = firstOfMonthUTC(addMonthsUTC(firstOfMonthUTC(priorEnd), -selLenMonths));
  const priorStartIso = isoDate(priorStart);
  const priorEndIso = isoDate(firstOfMonthUTC(priorEnd)); // exclusive

  // Build prior month list
  const priorMonths: string[] = [];
  const priorStartMonth = priorStartIso.slice(0, 7);
  const priorEndMonthExcl = priorEndIso.slice(0, 7);
  for (let m = priorStartMonth; m < priorEndMonthExcl; m = addMonthsYM(m, 1)) {
    priorMonths.push(m);
    if (priorMonths.length > 240) break;
  }

  // Query prior sales month totals
  let priorSalesRows: SalesMonthRow[] = [];
  if (priorMonths.length) {
    const priorQueryStartIso = isStarter ? (priorStartIso > cutoffIso ? priorStartIso : cutoffIso) : priorStartIso;
    const priorQueryStartMonth = priorQueryStartIso.slice(0, 7);
    const { data } = await supabase
      .from("v_sales_month_totals")
      .select("month, revenue, orders")
      .eq("tenant_id", tenantId)
      .gte("month", priorQueryStartMonth)
      .lt("month", priorEndMonthExcl)
      .order("month", { ascending: true });
    priorSalesRows =
      (data ?? [])
        .map((r: any) => [String(r.month), toNum(r.revenue), toNum(r.orders)] as [string, number, number])
        .map(([month, revenue, orders]) => ({ month, revenue, orders })) ?? [];
  }
  const priorSalesByMonth = new Map(priorSalesRows.map((r) => [r.month, r.revenue]));
  const priorOrdersByMonth = new Map(priorSalesRows.map((r) => [r.month, r.orders]));

  // Query prior expenses rows
  const priorQueryStartIso = isStarter ? (priorStartIso > cutoffIso ? priorStartIso : cutoffIso) : priorStartIso;
  const { data: priorExpRows } = await supabase
    .from("expenses")
    .select("occurred_at, amount_usd, category")
    .eq("tenant_id", tenantId)
    .gte("occurred_at", `${priorQueryStartIso}T00:00:00Z`)
    .lt("occurred_at", `${priorEndIso}T00:00:00Z`);

  const priorExpByMonth = new Map<string, ExpenseBucket>();
  for (const r of priorExpRows ?? []) {
    const dt = new Date((r as any).occurred_at);
    const k = `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}`;
    const c = catKey((r as any).category);
    const amt = toNum((r as any).amount_usd);
    if (!priorExpByMonth.has(k)) priorExpByMonth.set(k, { Food: 0, Beverage: 0, Labor: 0, Rent: 0, Utilities: 0, Marketing: 0, Misc: 0 });
    priorExpByMonth.get(k)![c] += amt;
  }

  const priorTotals = priorMonths.reduce(
    (acc, m) => {
      const isLocked = lockedMonth(m);
      const sales = isLocked ? 0 : toNum(priorSalesByMonth.get(m));
      const orders = isLocked ? 0 : toNum(priorOrdersByMonth.get(m));
      const exp = isLocked
        ? { Food: 0, Beverage: 0, Labor: 0, Rent: 0, Utilities: 0, Marketing: 0, Misc: 0 }
        : priorExpByMonth.get(m) ?? { Food: 0, Beverage: 0, Labor: 0, Rent: 0, Utilities: 0, Marketing: 0, Misc: 0 };

      acc.sales += sales;
      acc.orders += orders;
      acc.exp.Food += exp.Food;
      acc.exp.Beverage += exp.Beverage;
      acc.exp.Labor += exp.Labor;
      acc.exp.Rent += exp.Rent;
      acc.exp.Utilities += exp.Utilities;
      acc.exp.Marketing += exp.Marketing;
      acc.exp.Misc += exp.Misc;
      return acc;
    },
    {
      sales: 0,
      orders: 0,
      exp: { Food: 0, Beverage: 0, Labor: 0, Rent: 0, Utilities: 0, Marketing: 0, Misc: 0 } as ExpenseBucket,
    }
  );

  const priorNetExpenses = Object.values(priorTotals.exp).reduce((a, b) => a + b, 0);
  const priorNetIncome = priorTotals.sales - priorNetExpenses;

  function deltaText(curr: number, prev: number) {
    const d = curr - prev;
    const sign = d >= 0 ? "+" : "−";
    const abs = Math.abs(d);
    const pctVal = prev !== 0 ? Math.abs(d / prev) : curr !== 0 ? 1 : 0;
    const up = d >= 0;
    return {
      up,
      text: `${sign}${fmtUSD(abs)} (${sign}${Math.round(pctVal * 100)}%)`,
    };
  }

  const dNetIncome = deltaText(selNetIncome, priorNetIncome);
  const dSales = deltaText(selSales, priorTotals.sales);
  const dFood = deltaText(selExp.Food, priorTotals.exp.Food);
  const dLabor = deltaText(selExp.Labor, priorTotals.exp.Labor);
  const dPrime = deltaText(selExp.Food + selExp.Beverage + selExp.Labor, priorTotals.exp.Food + priorTotals.exp.Beverage + priorTotals.exp.Labor);

  /* ------------------------ mini chart series ------------------------ */
  // Build monthly series regardless of period (chart is monthly for readability)
  const chartMonths = months.slice(-Math.min(months.length, 24)); // cap to 24 months
  const chartSeries = chartMonths.map((m) => {
    const isLocked = lockedMonth(m);
    const sales = isLocked ? 0 : toNum(salesByMonth.get(m));
    const exp = isLocked ? 0 : Object.values(expByMonth.get(m) ?? { Food: 0, Beverage: 0, Labor: 0, Rent: 0, Utilities: 0, Marketing: 0, Misc: 0 }).reduce((a, b) => a + b, 0);
    return { m, sales, exp, net: sales - exp };
  });

  /* ------------------------ statement rows ------------------------ */
  type RowDef = {
    key: string;
    label: string;
    tooltip?: string;
    indent?: 0 | 1;
    bold?: boolean;
    section?: "cogs" | "opex" | null;
    // value extractors
    valueFor: (p: Agg) => number;
    totalFor: (totals: { sales: number; exp: ExpenseBucket }) => number;
    pctSales?: (totals: { sales: number; exp: ExpenseBucket }, v: number) => number;
  };

  const totalsObj = { sales: selSales, exp: selExp };

  const rowsExpanded: RowDef[] = [
    {
      key: "revenue",
      label: "Total Revenue",
      tooltip: "Total sales revenue for the period.",
      indent: 0,
      bold: true,
      section: null,
      valueFor: (p) => p.sales,
      totalFor: (t) => t.sales,
      pctSales: (t, v) => (t.sales > 0 ? v / t.sales : 0),
    },
    {
      key: "cogs",
      label: "Cost of Revenue",
      tooltip: "Direct costs tied to producing your sales (COGS). For food businesses, this is mainly Food + Beverage.",
      indent: 0,
      bold: true,
      section: "cogs",
      valueFor: (p) => p.exp.Food + p.exp.Beverage,
      totalFor: (t) => t.exp.Food + t.exp.Beverage,
      pctSales: (t, v) => (t.sales > 0 ? v / t.sales : 0),
    },
    {
      key: "food",
      label: "Food",
      tooltip: "Ingredients and food supply costs. Enter refunds/credits as negative values.",
      indent: 1,
      section: "cogs",
      valueFor: (p) => p.exp.Food,
      totalFor: (t) => t.exp.Food,
      pctSales: (t, v) => (t.sales > 0 ? v / t.sales : 0),
    },
    {
      key: "beverage",
      label: "Beverage",
      tooltip: "Beverage-related costs (non-food). Enter refunds/credits as negative values.",
      indent: 1,
      section: "cogs",
      valueFor: (p) => p.exp.Beverage,
      totalFor: (t) => t.exp.Beverage,
      pctSales: (t, v) => (t.sales > 0 ? v / t.sales : 0),
    },
    {
      key: "gross",
      label: "Gross Profit",
      tooltip: "Revenue minus Cost of Revenue (COGS).",
      indent: 0,
      bold: true,
      section: null,
      valueFor: (p) => p.sales - (p.exp.Food + p.exp.Beverage),
      totalFor: (t) => t.sales - (t.exp.Food + t.exp.Beverage),
      pctSales: (t, v) => (t.sales > 0 ? v / t.sales : 0),
    },
    {
      key: "opex",
      label: "Operating Expenses",
      tooltip: "Ongoing costs to run the business (Labor, Rent, Utilities, etc.). May be negative if refunds/credits exceed charges.",
      indent: 0,
      bold: true,
      section: "opex",
      valueFor: (p) => p.exp.Labor + p.exp.Rent + p.exp.Utilities + p.exp.Marketing + p.exp.Misc,
      totalFor: (t) => t.exp.Labor + t.exp.Rent + t.exp.Utilities + t.exp.Marketing + t.exp.Misc,
      pctSales: (t, v) => (t.sales > 0 ? v / t.sales : 0),
    },
    {
      key: "labor",
      label: "Labor",
      tooltip: "Wages and labor costs. (Payroll taxes/benefits can go here too, if you want it simple.)",
      indent: 1,
      section: "opex",
      valueFor: (p) => p.exp.Labor,
      totalFor: (t) => t.exp.Labor,
      pctSales: (t, v) => (t.sales > 0 ? v / t.sales : 0),
    },
    {
      key: "rent",
      label: "Rent",
      tooltip: "Rent / lease payments and related fixed occupancy costs.",
      indent: 1,
      section: "opex",
      valueFor: (p) => p.exp.Rent,
      totalFor: (t) => t.exp.Rent,
      pctSales: (t, v) => (t.sales > 0 ? v / t.sales : 0),
    },
    {
      key: "utilities",
      label: "Utilities",
      tooltip: "Utilities (electric, gas, water, etc.).",
      indent: 1,
      section: "opex",
      valueFor: (p) => p.exp.Utilities,
      totalFor: (t) => t.exp.Utilities,
      pctSales: (t, v) => (t.sales > 0 ? v / t.sales : 0),
    },
    {
      key: "marketing",
      label: "Marketing",
      tooltip: "Ads, promotions, and marketing expenses.",
      indent: 1,
      section: "opex",
      valueFor: (p) => p.exp.Marketing,
      totalFor: (t) => t.exp.Marketing,
      pctSales: (t, v) => (t.sales > 0 ? v / t.sales : 0),
    },
    {
      key: "misc",
      label: "Misc",
      tooltip: "Everything else not categorized above (small tools, supplies, fees, etc.).",
      indent: 1,
      section: "opex",
      valueFor: (p) => p.exp.Misc,
      totalFor: (t) => t.exp.Misc,
      pctSales: (t, v) => (t.sales > 0 ? v / t.sales : 0),
    },
    {
      key: "net",
      label: "Net Income",
      tooltip: "Revenue minus all expenses in the selected period.",
      indent: 0,
      bold: true,
      section: null,
      valueFor: (p) => p.sales - (p.exp.Food + p.exp.Beverage + p.exp.Labor + p.exp.Rent + p.exp.Utilities + p.exp.Marketing + p.exp.Misc),
      totalFor: (t) => t.sales - (t.exp.Food + t.exp.Beverage + t.exp.Labor + t.exp.Rent + t.exp.Utilities + t.exp.Marketing + t.exp.Misc),
      pctSales: (t, v) => (t.sales > 0 ? v / t.sales : 0),
    },
  ];

  const rowsCompact: RowDef[] = rowsExpanded.filter((r) => {
    if (r.key === "food" || r.key === "beverage" || r.key === "labor" || r.key === "rent" || r.key === "utilities" || r.key === "marketing" || r.key === "misc") return false;
    if (r.key === "opex") return true;
    if (r.key === "cogs") return true;
    if (r.key === "revenue") return true;
    if (r.key === "gross") return true;
    if (r.key === "net") return true;
    return true;
  });

  const rowDefs = view === "compact" ? rowsCompact : rowsExpanded;

  function sectionVisible(row: RowDef) {
    if (row.section === "cogs" && row.indent === 1) return expCogs;
    if (row.section === "opex" && row.indent === 1) return expOpex;
    return true;
  }

  /* ------------------------ header params helpers ------------------------ */
  const baseParams = {
    start: startIso,
    end: endIso,
    period,
    view,
    cogs: expCogs ? "1" : "0",
    opex: expOpex ? "1" : "0",
  };

  const applyParams = (extra: Record<string, string>) => {
    const merged = { ...baseParams, ...extra };
    // remove preset if explicit start/end changes
    if (merged.start && merged.end) delete (merged as any).preset;
    return merged;
  };

  const qTaxPack = new URLSearchParams({ start: startIso, end: endIso }).toString();

  return (
    <main className="max-w-6xl mx-auto px-4 py-6">
      {/* Top bar: tidy layout */}
      <div className="flex flex-col gap-3 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-xl font-semibold mr-1">Financials</div>

          {/* Presets */}
          <div className="flex items-center gap-1">
            {["1m", "3m", "6m", "ytd", "1y", "all"].map((k) => {
              const active = preset === k;
              return (
                <Link
                  key={k}
                  href={buildHref("/financial", { ...baseParams, preset: k })}
                  className={`px-2 py-1 rounded-full border text-xs ${
                    active ? "bg-emerald-600/15 border-emerald-500/50 text-emerald-200" : "hover:bg-neutral-900"
                  }`}
                >
                  {niceRangeLabel(k)}
                </Link>
              );
            })}
          </div>

          <div className="flex-1" />

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <a href={`/api/accounting/export?${qTaxPack}`} className="border rounded px-3 h-10 flex items-center hover:bg-neutral-900">
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

        {/* Controls row */}
        <div className="flex flex-wrap items-end gap-3">
          <form action="/financial" className="flex flex-wrap items-end gap-3">
            {/* keep other params */}
            <input type="hidden" name="period" value={period} />
            <input type="hidden" name="view" value={view} />
            <input type="hidden" name="cogs" value={expCogs ? "1" : "0"} />
            <input type="hidden" name="opex" value={expOpex ? "1" : "0"} />

            <div className="flex flex-col">
              <label className="text-xs opacity-70 mb-1">Start (UTC)</label>
              <input type="date" name="start" defaultValue={startIso} className="border rounded px-2 h-10 bg-transparent" />
            </div>
            <div className="flex flex-col">
              <label className="text-xs opacity-70 mb-1">End (UTC)</label>
              <input type="date" name="end" defaultValue={endIso} className="border rounded px-2 h-10 bg-transparent" />
            </div>
            <button className="border rounded px-4 h-10 hover:bg-neutral-900">Apply</button>
          </form>

          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col">
              <label className="text-xs opacity-70 mb-1">
                Period <Info text="Monthly shows each month. Quarterly groups into Q1–Q4. Annual groups by year." />
              </label>
              <select
                className="border rounded px-2 h-10 bg-transparent"
                value={period}
                onChange={(e) => {
                  const v = e.target.value as Period;
                  window.location.href = buildHref("/financial", { ...baseParams, period: v });
                }}
              >
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annual">Annual</option>
              </select>
            </div>

            <div className="flex flex-col">
              <label className="text-xs opacity-70 mb-1">
                View <Info text="Expanded shows sub-lines (Food/Beverage, Labor/Rent/etc.). Compact shows only major totals." />
              </label>
              <select
                className="border rounded px-2 h-10 bg-transparent"
                value={view}
                onChange={(e) => {
                  const v = e.target.value as ViewMode;
                  window.location.href = buildHref("/financial", { ...baseParams, view: v });
                }}
              >
                <option value="expanded">Expanded</option>
                <option value="compact">Compact</option>
              </select>
            </div>

            <div className="flex items-center gap-2 pb-1">
              <Link
                href={buildHref("/financial", { ...baseParams, cogs: "1", opex: "1" })}
                className="text-xs border rounded px-2 py-1 hover:bg-neutral-900"
              >
                Expand all
              </Link>
              <Link
                href={buildHref("/financial", { ...baseParams, cogs: "0", opex: "0" })}
                className="text-xs border rounded px-2 py-1 hover:bg-neutral-900"
              >
                Collapse all
              </Link>
            </div>
          </div>

          <div className="flex-1" />

          <div className="text-xs opacity-70 pb-2">
            Note: refunds/credits should be entered as negative expenses (example: -25.00). Financials shows net expenses.
          </div>
        </div>

        {isStarter && (
          <div className="text-xs rounded border border-amber-600/40 bg-amber-900/10 px-3 py-2 text-amber-200">
            Starter shows last 3 months (older periods display $0).{" "}
            <Link href="/profile" className="underline">
              Upgrade to Basic
            </Link>{" "}
            for full history.
          </div>
        )}
      </div>

      {/* Summary panel (fills whitespace with useful finance context) */}
      <section className="border rounded-xl p-4">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex-1 min-w-[320px]">
            <div className="text-xs opacity-70 mb-1">
              INCOME STATEMENT · {startMonth} → {addMonthsYM(endMonthExcl, -1)}
            </div>

            <div className="text-4xl font-semibold leading-tight">{fmtUSD(selNetIncome)}</div>

            <div className="text-sm opacity-80 mt-1">
              Net income for selected period{" "}
              <span className={dNetIncome.up ? "text-emerald-300" : "text-rose-300"}>
                {dNetIncome.text}
              </span>{" "}
              vs prior period ({priorStartMonth} → {addMonthsYM(priorEndMonthExcl, -1)})
              <Info text="Prior period is the same length immediately before your selected range." />
            </div>

            {/* KPI strip (tight, high-signal) */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
              <div className="border rounded-lg p-2">
                <div className="text-xs opacity-70">
                  Sales <Info text="Total revenue from sales in the selected period." />
                </div>
                <div className="font-semibold">{fmtUSD(selSales)}</div>
                <div className={`text-xs mt-0.5 ${dSales.up ? "text-emerald-300" : "text-rose-300"}`}>{dSales.text}</div>
              </div>
              <div className="border rounded-lg p-2">
                <div className="text-xs opacity-70">
                  Net expenses <Info text="All expenses net of refunds/credits. Can be negative in rare cases." />
                </div>
                <div className="font-semibold">{fmtUSD(selNetExpenses)}</div>
              </div>
              <div className="border rounded-lg p-2">
                <div className="text-xs opacity-70">
                  Prime % <Info text="(Food + Beverage + Labor) ÷ Sales. Key cost control metric for food businesses." />
                </div>
                <div className="font-semibold">{pct(selPrimePct)}</div>
                <div className={`text-xs mt-0.5 ${dPrime.up ? "text-rose-300" : "text-emerald-300"}`}>
                  {dPrime.text}
                </div>
              </div>
              <div className="border rounded-lg p-2">
                <div className="text-xs opacity-70">
                  Net margin <Info text="Net income ÷ Sales. Higher is better." />
                </div>
                <div className="font-semibold">{pct(selNetMargin)}</div>
              </div>
            </div>

            {/* Purposeful mini chart: Sales vs Net Expenses + Net Income */}
            <div className="mt-4 border rounded-xl p-3">
              <div className="text-sm opacity-80 mb-2">
                Monthly trend <span className="opacity-60">(Sales vs Net Expenses, Net Income)</span>
              </div>
              <div className="h-44">
                {(() => {
                  const width = 720,
                    height = 180,
                    left = 40,
                    right = 10,
                    top = 10,
                    bottom = 28;
                  const W = width - left - right;
                  const H = height - top - bottom;

                  const maxVal = Math.max(1, ...chartSeries.flatMap((r) => [r.sales, r.exp, Math.abs(r.net)]));
                  const maxAbsNet = Math.max(1, ...chartSeries.map((r) => Math.abs(r.net)));
                  const dx = chartSeries.length > 0 ? W / chartSeries.length : 0;

                  const y = (v: number) => top + H - (v / maxVal) * H;
                  const yNet = (v: number) => top + H - ((v + maxAbsNet) / (maxAbsNet * 2)) * H;

                  const bars = chartSeries.map((r, i) => {
                    const x = left + i * dx + 2;
                    const bw = Math.max(2, dx - 6);
                    const salesH = H - (y(r.sales) - top);
                    const expH = H - (y(r.exp) - top);

                    return (
                      <g key={r.m}>
                        {/* expenses bar */}
                        <rect
                          x={x}
                          y={y(r.exp)}
                          width={bw}
                          height={expH}
                          fill="#4da3ff"
                          opacity="0.35"
                        />
                        {/* sales bar */}
                        <rect
                          x={x}
                          y={y(r.sales)}
                          width={bw}
                          height={salesH}
                          fill="#3ea65f"
                          opacity="0.35"
                        />
                      </g>
                    );
                  });

                  const netPath =
                    chartSeries.length > 0
                      ? chartSeries
                          .map((r, i) => {
                            const cx = left + i * dx + dx / 2;
                            const cy = yNet(r.net);
                            return `${i === 0 ? "M" : "L"} ${cx.toFixed(1)} ${cy.toFixed(1)}`;
                          })
                          .join(" ")
                      : "";

                  // baseline at net=0
                  const y0 = yNet(0);

                  return (
                    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full">
                      <line x1={left} y1={top} x2={left} y2={top + H} stroke="#2a2a2a" />
                      <line x1={left} y1={top + H} x2={left + W} y2={top + H} stroke="#2a2a2a" />
                      <line x1={left} y1={y0} x2={left + W} y2={y0} stroke="#2a2a2a" strokeDasharray="4 4" />

                      {bars}
                      <path d={netPath} fill="none" stroke="#e5e7eb" strokeWidth="2" opacity="0.9" />

                      {/* x labels (sparse) */}
                      {chartSeries.map((r, i) => {
                        const show = chartSeries.length <= 8 || i === 0 || i === chartSeries.length - 1 || i % 3 === 0;
                        if (!show) return null;
                        const cx = left + i * dx + dx / 2;
                        return (
                          <text key={`t-${r.m}`} x={cx} y={top + H + 18} fontSize="10" textAnchor="middle" fill="#9ca3af">
                            {r.m}
                          </text>
                        );
                      })}
                    </svg>
                  );
                })()}
              </div>
              <div className="text-xs opacity-70 mt-2">
                Bars show Sales (green) vs Net Expenses (blue). White line is Net Income. Net expenses can be negative (refunds/credits).
              </div>
            </div>

            {/* Variance drivers (fills the remaining “dead air” with meaning) */}
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
              <div className="border rounded-lg p-3">
                <div className="text-sm opacity-80 mb-2">Variance highlights (vs prior period)</div>
                <div className="text-sm space-y-1">
                  <div className="flex justify-between">
                    <span>
                      Net income <Info text="Change in net income vs prior period." />
                    </span>
                    <span className={dNetIncome.up ? "text-emerald-300" : "text-rose-300"}>{dNetIncome.text}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>
                      Sales <Info text="Change in sales revenue vs prior period." />
                    </span>
                    <span className={dSales.up ? "text-emerald-300" : "text-rose-300"}>{dSales.text}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>
                      Food cost <Info text="Change in food costs vs prior period. Lower is usually better." />
                    </span>
                    <span className={dFood.up ? "text-rose-300" : "text-emerald-300"}>{dFood.text}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>
                      Labor cost <Info text="Change in labor costs vs prior period. Lower is usually better." />
                    </span>
                    <span className={dLabor.up ? "text-rose-300" : "text-emerald-300"}>{dLabor.text}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>
                      Prime cost <Info text="Food + Beverage + Labor change vs prior period." />
                    </span>
                    <span className={dPrime.up ? "text-rose-300" : "text-emerald-300"}>{dPrime.text}</span>
                  </div>
                </div>
              </div>

              <div className="border rounded-lg p-3">
                <div className="text-sm font-medium mb-2">Key stats</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="opacity-80">
                      Sales <Info text="Total revenue from sales in the selected period." />
                    </span>
                    <span className="tabular-nums">{fmtUSD(selSales)}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="opacity-80">
                      Net expenses <Info text="All expenses net of refunds/credits. Can be negative." />
                    </span>
                    <span className="tabular-nums">{fmtUSD(selNetExpenses)}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="opacity-80">
                      Net income <Info text="Revenue minus all expenses." />
                    </span>
                    <span className="tabular-nums">{fmtUSD(selNetIncome)}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="opacity-80">
                      Orders <Info text="Total number of orders in the selected period." />
                    </span>
                    <span className="tabular-nums">{selOrders}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="opacity-80">
                      AOV <Info text="Average Order Value = Sales ÷ Orders." />
                    </span>
                    <span className="tabular-nums">{fmtUSD(selAOV)}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="opacity-80">
                      Food % <Info text="Food cost ÷ Sales. Lower is usually better." />
                    </span>
                    <span className="tabular-nums">{pct(selFoodPct)}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="opacity-80">
                      Labor % <Info text="Labor cost ÷ Sales. Lower is usually better." />
                    </span>
                    <span className="tabular-nums">{pct(selLaborPct)}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="opacity-80">
                      Prime % <Info text="(Food + Beverage + Labor) ÷ Sales. Key cost control metric." />
                    </span>
                    <span className="tabular-nums">{pct(selPrimePct)}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="opacity-80">
                      Net margin <Info text="Net income ÷ Sales. Higher is better." />
                    </span>
                    <span className="tabular-nums">{pct(selNetMargin)}</span>
                  </div>
                  <div />
                </div>
              </div>
            </div>
          </div>

          {/* Right-side quick controls for expanding sections (Yahoo-like feel) */}
          <div className="w-full md:w-[260px] border rounded-xl p-3 h-fit">
            <div className="text-sm font-medium mb-2">Statement controls</div>

            <div className="text-xs opacity-70 mb-1">
              Expand sections <Info text="Collapse sub-lines to reduce horizontal scrolling." />
            </div>

            <div className="flex flex-col gap-2">
              <Link
                href={buildHref("/financial", { ...baseParams, cogs: expCogs ? "0" : "1" })}
                className="border rounded px-3 py-2 text-sm hover:bg-neutral-900 flex justify-between"
              >
                <span>
                  COGS details <Info text="Shows Food and Beverage lines under Cost of Revenue." />
                </span>
                <span className="opacity-70">{expCogs ? "On" : "Off"}</span>
              </Link>

              <Link
                href={buildHref("/financial", { ...baseParams, opex: expOpex ? "0" : "1" })}
                className="border rounded px-3 py-2 text-sm hover:bg-neutral-900 flex justify-between"
              >
                <span>
                  OpEx details <Info text="Shows Labor/Rent/Utilities/Marketing/Misc under Operating Expenses." />
                </span>
                <span className="opacity-70">{expOpex ? "On" : "Off"}</span>
              </Link>

              <div className="text-xs opacity-70 mt-2">
                Columns are {period === "monthly" ? "months" : period === "quarterly" ? "quarters" : "years"} · Values in USD · Net expenses may be negative
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Income Statement Table */}
      <section className="border rounded-xl mt-4 overflow-x-auto">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div className="text-sm font-medium">Income Statement</div>
          <div className="text-xs opacity-70">Columns are {period === "monthly" ? "months" : period === "quarterly" ? "quarters" : "years"} · Values in USD · Net expenses may be negative</div>
        </div>

        <table className="w-full text-sm min-w-[920px]">
          <thead className="opacity-80">
            <tr className="border-b">
              <th className="text-left font-normal px-3 py-2 w-[240px]">Breakdown</th>
              {periods.map((p) => (
                <th key={p.key} className="text-right font-normal px-3 py-2 whitespace-nowrap">
                  {periodLabel(p.key, period)}
                </th>
              ))}
              <th className="text-right font-normal px-3 py-2">Total</th>
              <th className="text-right font-normal px-3 py-2">% Sales</th>
            </tr>
          </thead>

          <tbody>
            {rowDefs.filter(sectionVisible).map((row) => {
              // hide subrows if collapsed
              if (row.section === "cogs" && row.indent === 1 && !expCogs) return null;
              if (row.section === "opex" && row.indent === 1 && !expOpex) return null;

              const totalVal = row.totalFor(totalsObj);
              const pctSales = row.pctSales ? row.pctSales(totalsObj, totalVal) : null;

              const label =
                row.indent === 1 ? (
                  <span className="flex items-center gap-2">
                    <span className="opacity-70">—</span>
                    <span>{row.label}</span>
                    {row.tooltip ? <Info text={row.tooltip} /> : null}
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <span>{row.label}</span>
                    {row.tooltip ? <Info text={row.tooltip} /> : null}
                  </span>
                );

              return (
                <tr key={row.key} className="border-t">
                  <td className={`px-3 py-2 ${row.bold ? "font-semibold" : ""}`}>{label}</td>
                  {periods.map((p) => {
                    const v = row.valueFor(p);
                    return (
                      <td key={`${row.key}-${p.key}`} className={`px-3 py-2 text-right tabular-nums ${row.bold ? "font-semibold" : ""}`}>
                        {fmtUSD(v)}
                      </td>
                    );
                  })}
                  <td className={`px-3 py-2 text-right tabular-nums ${row.bold ? "font-semibold" : ""}`}>{fmtUSD(totalVal)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${row.bold ? "font-semibold" : ""}`}>
                    {pctSales === null ? "—" : pct(pctSales)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </main>
  );
}
