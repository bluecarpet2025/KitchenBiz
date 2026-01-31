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

function ymFromDateUTC(d: Date) {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}
function ymToIsoStart(ym: string) {
  return `${ym}-01`;
}
function addMonthsYM(ym: string, delta: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  d.setUTCMonth(d.getUTCMonth() + delta);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}
function monthKeyUTC(ts: string | Date) {
  const d = typeof ts === "string" ? new Date(ts) : ts;
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}
function clampStartByCutoffIso(startIso: string, cutoffIso: string) {
  return startIso > cutoffIso ? startIso : cutoffIso;
}
function parseIsoDate(s: string | undefined | null) {
  if (!s) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}
function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}
function betweenInclusiveYM(m: string, start: string, end: string) {
  return m >= start && m <= end;
}

type SalesMonthRow = { month: string; revenue: number; orders: number };
type ExpRow = { occurred_at: string; amount_usd: number; category: string | null };

type CatBucket = {
  Food: number;
  Beverage: number;
  Labor: number;
  Rent: number;
  Utilities: number;
  Marketing: number;
  Misc: number;
};

function emptyBucket(): CatBucket {
  return { Food: 0, Beverage: 0, Labor: 0, Rent: 0, Utilities: 0, Marketing: 0, Misc: 0 };
}
function catKey(c: string | null): keyof CatBucket {
  const k = String(c ?? "").trim().toLowerCase();
  // You wanted to allow custom in general; Financials groups into accountant-friendly buckets.
  // Rules: if user writes "food" or "beverage" we split; otherwise map the common set.
  if (k === "food") return "Food";
  if (k === "beverage") return "Beverage";
  if (k === "labor") return "Labor";
  if (k === "rent") return "Rent";
  if (k === "utilities") return "Utilities";
  if (k === "marketing") return "Marketing";
  return "Misc";
}

function sumBucket(b: CatBucket) {
  return Object.values(b).reduce((a, x) => a + Number(x || 0), 0);
}

/* =============================== PAGE =============================== */
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
        <div className="text-xl font-semibold mb-2">Financials</div>
        <div className="text-sm opacity-70">Sign in to view financials.</div>
      </main>
    );
  }

  const plan = await effectivePlan();
  const isStarter = plan === "starter";

  // Starter cutoff: rolling last 3 months (UTC)
  const now = new Date();
  const cutoffDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  cutoffDate.setUTCMonth(cutoffDate.getUTCMonth() - 3);
  const cutoffIso = `${cutoffDate.getUTCFullYear()}-${pad2(cutoffDate.getUTCMonth() + 1)}-${pad2(cutoffDate.getUTCDate())}`;
  const cutoffYM = `${cutoffDate.getUTCFullYear()}-${pad2(cutoffDate.getUTCMonth() + 1)}`;

  /* ---------------- Determine data bounds (for YTD/ALL to work right) ---------------- */
  // Sales months
  const { data: salesBounds } = await supabase
    .from("v_sales_month_totals")
    .select("month")
    .eq("tenant_id", tenantId)
    .order("month", { ascending: false })
    .limit(1);

  const { data: salesMin } = await supabase
    .from("v_sales_month_totals")
    .select("month")
    .eq("tenant_id", tenantId)
    .order("month", { ascending: true })
    .limit(1);

  // Expense bounds (occurred_at)
  const { data: expMax } = await supabase
    .from("expenses")
    .select("occurred_at")
    .eq("tenant_id", tenantId)
    .order("occurred_at", { ascending: false })
    .limit(1);

  const { data: expMin } = await supabase
    .from("expenses")
    .select("occurred_at")
    .eq("tenant_id", tenantId)
    .order("occurred_at", { ascending: true })
    .limit(1);

  const latestSalesYM = salesBounds?.[0]?.month ? String(salesBounds[0].month) : null;
  const earliestSalesYM = salesMin?.[0]?.month ? String(salesMin[0].month) : null;
  const latestExpYM = expMax?.[0]?.occurred_at ? monthKeyUTC(String(expMax[0].occurred_at)) : null;
  const earliestExpYM = expMin?.[0]?.occurred_at ? monthKeyUTC(String(expMin[0].occurred_at)) : null;

  const latestYM = [latestSalesYM, latestExpYM].filter(Boolean).sort().slice(-1)[0] ?? ymFromDateUTC(now);
  const earliestYM = [earliestSalesYM, earliestExpYM].filter(Boolean).sort()[0] ?? latestYM;

  const latestYear = Number(String(latestYM).slice(0, 4));

  /* ---------------- Range selection rules ---------------- */
  // manual start/end always win, otherwise range chips decide.
  const startIsoManual = parseIsoDate(sp.start);
  const endIsoManual = parseIsoDate(sp.end);

  const range = (sp.range ?? "").toLowerCase(); // 1m | 3m | 6m | ytd | 1y | all

  // End month exclusive is always (selectedEndYM + 1 month) in our internal month columns,
  // but date input wants ISO dates.
  let selStartYM: string;
  let selEndYM: string; // inclusive
  if (startIsoManual && endIsoManual) {
    selStartYM = startIsoManual.slice(0, 7);
    // end date is exclusive in the old page; for statement we treat it as "end month inclusive"
    // by taking endIso - 1 month if user used Jan 1 of next year pattern.
    // Simpler: interpret as [startYM ... <endYMExcl] like before.
    const endYMExcl = endIsoManual.slice(0, 7);
    selEndYM = addMonthsYM(endYMExcl, -1);
  } else {
    // chip-driven, based on latestYM and actual data
    if (range === "1m") {
      selEndYM = latestYM;
      selStartYM = latestYM;
    } else if (range === "3m") {
      selEndYM = latestYM;
      selStartYM = addMonthsYM(latestYM, -2);
    } else if (range === "6m") {
      selEndYM = latestYM;
      selStartYM = addMonthsYM(latestYM, -5);
    } else if (range === "1y") {
      selEndYM = latestYM;
      selStartYM = addMonthsYM(latestYM, -11);
    } else if (range === "ytd") {
      // ✅ YTD = Jan of the latest data year through the latest data month
      selStartYM = `${latestYear}-01`;
      selEndYM = latestYM;
    } else if (range === "all") {
      // ✅ ALL = all months with data, from earliest to latest
      selStartYM = earliestYM;
      selEndYM = latestYM;
    } else {
      // default: YTD behavior (accountant expectation)
      selStartYM = `${latestYear}-01`;
      selEndYM = latestYM;
    }
  }

  // Starter clamp: only show last 3 months (older months excluded entirely from statement view)
  if (isStarter) {
    if (selEndYM < cutoffYM) {
      // everything is locked; show empty but still render structure
      selStartYM = cutoffYM;
      selEndYM = cutoffYM;
    } else if (selStartYM < cutoffYM) {
      selStartYM = cutoffYM;
    }
  }

  const monthsAsc: string[] = [];
  for (let m = selStartYM; m <= selEndYM; m = addMonthsYM(m, 1)) {
    monthsAsc.push(m);
    if (monthsAsc.length > 240) break;
  }

  const startIso = ymToIsoStart(selStartYM);
  const endYMExcl = addMonthsYM(selEndYM, 1);
  const endIso = ymToIsoStart(endYMExcl);

  /* ---------------- Fetch sales for selected months ---------------- */
  const { data: salesRowsRaw } = await supabase
    .from("v_sales_month_totals")
    .select("month, revenue, orders")
    .eq("tenant_id", tenantId)
    .gte("month", selStartYM)
    .lte("month", selEndYM)
    .order("month", { ascending: true });

  const salesRows: SalesMonthRow[] =
    (salesRowsRaw ?? []).map((r: any) => ({
      month: String(r.month),
      revenue: Number(r.revenue ?? 0),
      orders: Number(r.orders ?? 0),
    })) ?? [];

  const salesByMonth = new Map(salesRows.map((r) => [r.month, r.revenue]));
  const ordersByMonth = new Map(salesRows.map((r) => [r.month, r.orders]));

  /* ---------------- Fetch expenses in selected range ---------------- */
  // Use ISO range on occurred_at
  const { data: expRowsRaw } = await supabase
    .from("expenses")
    .select("occurred_at, amount_usd, category")
    .eq("tenant_id", tenantId)
    .gte("occurred_at", `${startIso}T00:00:00Z`)
    .lt("occurred_at", `${endIso}T00:00:00Z`);

  const expRows: ExpRow[] =
    (expRowsRaw ?? []).map((r: any) => ({
      occurred_at: String(r.occurred_at),
      amount_usd: Number(r.amount_usd ?? 0), // can be negative now ✅
      category: (r.category ?? null) as string | null,
    })) ?? [];

  const expByMonth = new Map<string, CatBucket>();
  for (const r of expRows) {
    const m = monthKeyUTC(r.occurred_at);
    if (!betweenInclusiveYM(m, selStartYM, selEndYM)) continue;
    if (!expByMonth.has(m)) expByMonth.set(m, emptyBucket());
    const bucket = expByMonth.get(m)!;
    const k = catKey(r.category);
    bucket[k] += Number(r.amount_usd || 0);
  }

  /* ---------------- Build statement columns (Yahoo-style) ---------------- */
  const colMonths = monthsAsc; // keep ascending for readability like statements
  const rowValue = (m: string, getter: (m: string) => number) => getter(m);

  const revenue = (m: string) => Number(salesByMonth.get(m) || 0);

  const bucket = (m: string) => expByMonth.get(m) ?? emptyBucket();
  const food = (m: string) => bucket(m).Food;
  const beverage = (m: string) => bucket(m).Beverage;
  const labor = (m: string) => bucket(m).Labor;
  const rent = (m: string) => bucket(m).Rent;
  const utilities = (m: string) => bucket(m).Utilities;
  const marketing = (m: string) => bucket(m).Marketing;
  const misc = (m: string) => bucket(m).Misc;

  const cogs = (m: string) => food(m) + beverage(m); // Cost of revenue
  const grossProfit = (m: string) => revenue(m) - cogs(m);

  const opex = (m: string) => labor(m) + rent(m) + utilities(m) + marketing(m) + misc(m);
  const netIncome = (m: string) => grossProfit(m) - opex(m);

  const totalRevenue = colMonths.reduce((a, m) => a + revenue(m), 0);
  const totalCOGS = colMonths.reduce((a, m) => a + cogs(m), 0);
  const totalGross = totalRevenue - totalCOGS;
  const totalOpex = colMonths.reduce((a, m) => a + opex(m), 0);
  const totalNet = totalGross - totalOpex;

  const totalOrders = colMonths.reduce((a, m) => a + Number(ordersByMonth.get(m) || 0), 0);
  const aov = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  const primeCost = colMonths.reduce((a, m) => a + food(m) + beverage(m) + labor(m), 0);
  const primePct = totalRevenue !== 0 ? (primeCost / totalRevenue) * 100 : 0;
  const foodPct = totalRevenue !== 0 ? ((colMonths.reduce((a, m) => a + food(m) + beverage(m), 0) / totalRevenue) * 100) : 0;
  const laborPct = totalRevenue !== 0 ? ((colMonths.reduce((a, m) => a + labor(m), 0) / totalRevenue) * 100) : 0;

  const netMarginPct = totalRevenue !== 0 ? (totalNet / totalRevenue) * 100 : 0;

  // Comparison: prior period of same length immediately preceding selection
  const periodLen = colMonths.length;
  const priorEndYM = addMonthsYM(selStartYM, -1);
  const priorStartYM = addMonthsYM(priorEndYM, -(periodLen - 1));
  const priorMonths: string[] = [];
  for (let m = priorStartYM; m <= priorEndYM; m = addMonthsYM(m, 1)) {
    priorMonths.push(m);
    if (priorMonths.length > 240) break;
  }

  // Fetch prior sales & expenses ONLY if the prior window overlaps data; otherwise show 0 change
  const priorStartIso = ymToIsoStart(priorStartYM);
  const priorEndIso = ymToIsoStart(addMonthsYM(priorEndYM, 1));

  const [{ data: priorSalesRaw }, { data: priorExpRaw }] = await Promise.all([
    supabase
      .from("v_sales_month_totals")
      .select("month, revenue")
      .eq("tenant_id", tenantId)
      .gte("month", priorStartYM)
      .lte("month", priorEndYM),
    supabase
      .from("expenses")
      .select("occurred_at, amount_usd, category")
      .eq("tenant_id", tenantId)
      .gte("occurred_at", `${priorStartIso}T00:00:00Z`)
      .lt("occurred_at", `${priorEndIso}T00:00:00Z`),
  ]);

  const priorSalesByMonth = new Map<string, number>(
    (priorSalesRaw ?? []).map((r: any) => [String(r.month), Number(r.revenue ?? 0)])
  );
  const priorExpByMonth = new Map<string, CatBucket>();
  for (const r of (priorExpRaw ?? []) as any[]) {
    const m = monthKeyUTC(String(r.occurred_at));
    if (!betweenInclusiveYM(m, priorStartYM, priorEndYM)) continue;
    if (!priorExpByMonth.has(m)) priorExpByMonth.set(m, emptyBucket());
    const b = priorExpByMonth.get(m)!;
    b[catKey((r.category ?? null) as any)] += Number(r.amount_usd ?? 0);
  }
  const priorRevenueTotal = priorMonths.reduce((a, m) => a + (priorSalesByMonth.get(m) || 0), 0);
  const priorOpexTotal = priorMonths.reduce((a, m) => {
    const b = priorExpByMonth.get(m) ?? emptyBucket();
    return a + (b.Labor + b.Rent + b.Utilities + b.Marketing + b.Misc);
  }, 0);
  const priorCogsTotal = priorMonths.reduce((a, m) => {
    const b = priorExpByMonth.get(m) ?? emptyBucket();
    return a + (b.Food + b.Beverage);
  }, 0);
  const priorNet = (priorRevenueTotal - priorCogsTotal) - priorOpexTotal;

  const deltaNet = totalNet - priorNet;
  const pctNet = Math.abs(priorNet) > 0.0001 ? (deltaNet / priorNet) * 100 : null;

  /* ---------------- UI helpers ---------------- */
  const chip = (label: string, r: string) => {
    const active = (range || (startIsoManual && endIsoManual ? "custom" : "ytd")) === r;
    return (
      <Link
        href={`/financial?range=${encodeURIComponent(r)}`}
        className={`text-xs px-2 py-1 rounded-full border ${
          active ? "border-emerald-500 text-emerald-300 bg-emerald-900/10" : "border-neutral-700 opacity-80 hover:bg-neutral-900"
        }`}
      >
        {label}
      </Link>
    );
  };

  const q = new URLSearchParams({ start: startIso, end: endIso }).toString();

  // Table cell formatting
  const cell = (n: number) => (
    <span className="tabular-nums">{fmtUSD(n)}</span>
  );
  const pctCell = (n: number) => (
    <span className="tabular-nums">{`${(Number.isFinite(n) ? n : 0).toFixed(0)}%`}</span>
  );

  return (
    <main className="max-w-6xl mx-auto px-4 py-6">
      {/* Header row */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="text-xl font-semibold mr-4">Financials</div>

        {/* Range chips */}
        <div className="flex items-center gap-2 mr-4">
          {chip("1M", "1m")}
          {chip("3M", "3m")}
          {chip("6M", "6m")}
          {chip("YTD", "ytd")}
          {chip("1Y", "1y")}
          {chip("ALL", "all")}
        </div>

        {/* Date range */}
        <label className="text-xs opacity-70 ml-2">Start (UTC)</label>
        <form action="/financial" className="contents">
          <input type="date" name="start" defaultValue={startIso} className="border rounded px-2 h-10 bg-transparent" />
          <label className="text-xs opacity-70 ml-2">End (UTC)</label>
          <input type="date" name="end" defaultValue={endIso} className="border rounded px-2 h-10 bg-transparent" />
          <button className="border rounded px-3 h-10 hover:bg-neutral-900 ml-2">Apply</button>
        </form>

        <div className="flex-1" />

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

      {/* Starter note */}
      {isStarter && (
        <div className="mb-3 text-xs rounded border border-amber-600/40 bg-amber-900/10 px-3 py-2 text-amber-200">
          Starter shows a rolling last 3 months only.{" "}
          <Link href="/profile" className="underline">
            Upgrade to Basic
          </Link>{" "}
          for full history.
        </div>
      )}

      {/* Accountant note (single, not repetitive) */}
      <div className="mb-4 text-xs rounded border border-neutral-800 bg-neutral-900/20 px-3 py-2 opacity-80">
        Note: refunds/credits should be entered as <b>negative expenses</b> (example: <span className="tabular-nums">-25.00</span>). Financials shows <b>net</b> expenses.
      </div>

      {/* Summary panel (compact, numbers-forward) */}
      <section className="border rounded-lg p-4 mb-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs opacity-70">INCOME STATEMENT • {selStartYM} → {selEndYM}</div>
            <div className="mt-1 text-3xl font-semibold tabular-nums">{fmtUSD(totalNet)}</div>
            <div className="text-xs mt-1 opacity-80">
              Net income for selected period{" "}
              <span className={deltaNet >= 0 ? "text-emerald-300" : "text-rose-300"}>
                {deltaNet >= 0 ? "+" : ""}
                {fmtUSD(deltaNet)}
                {pctNet === null ? "" : ` (${pctNet >= 0 ? "+" : ""}${pctNet.toFixed(0)}%)`}
              </span>{" "}
              vs prior period ({priorStartYM} → {priorEndYM})
            </div>
          </div>

          <div className="min-w-[280px] border border-neutral-800 rounded-md p-3">
            <div className="text-xs font-medium opacity-80 mb-2">Key stats</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <div className="opacity-70">Sales</div><div className="text-right tabular-nums">{fmtUSD(totalRevenue)}</div>
              <div className="opacity-70">Net expenses</div><div className="text-right tabular-nums">{fmtUSD(totalCOGS + totalOpex)}</div>
              <div className="opacity-70">Net income</div><div className="text-right tabular-nums">{fmtUSD(totalNet)}</div>
              <div className="opacity-70">Orders</div><div className="text-right tabular-nums">{totalOrders}</div>
              <div className="opacity-70">AOV</div><div className="text-right tabular-nums">{fmtUSD(aov)}</div>
              <div className="opacity-70">Food %</div><div className="text-right tabular-nums">{foodPct.toFixed(0)}%</div>
              <div className="opacity-70">Labor %</div><div className="text-right tabular-nums">{laborPct.toFixed(0)}%</div>
              <div className="opacity-70">Prime %</div><div className="text-right tabular-nums">{primePct.toFixed(0)}%</div>
              <div className="opacity-70">Net margin</div><div className="text-right tabular-nums">{netMarginPct.toFixed(0)}%</div>
            </div>
          </div>
        </div>
      </section>

      {/* Statement table (Yahoo-style: breakdown rows, periods as columns) */}
      <section className="border rounded-lg overflow-x-auto">
        <div className="px-4 py-3 border-b text-sm opacity-80 flex items-center justify-between">
          <div>Income Statement</div>
          <div className="text-xs opacity-70">
            Columns are months • Values in USD • Net expenses may be negative
          </div>
        </div>

        <table className="w-full text-sm">
          <thead className="bg-neutral-900/40">
            <tr className="opacity-90">
              <th className="text-left font-normal px-3 py-2 sticky left-0 bg-neutral-950">Breakdown</th>
              {colMonths.map((m) => (
                <th key={m} className="text-right font-normal px-3 py-2 tabular-nums whitespace-nowrap">
                  {m}
                </th>
              ))}
              <th className="text-right font-normal px-3 py-2 tabular-nums whitespace-nowrap">Total</th>
              <th className="text-right font-normal px-3 py-2 tabular-nums whitespace-nowrap">% Sales</th>
            </tr>
          </thead>

          <tbody>
            {/* Revenue */}
            <tr className="border-t">
              <td className="px-3 py-2 sticky left-0 bg-neutral-950 font-medium">Total Revenue</td>
              {colMonths.map((m) => (
                <td key={m} className="px-3 py-2 text-right tabular-nums">{cell(revenue(m))}</td>
              ))}
              <td className="px-3 py-2 text-right tabular-nums font-medium">{cell(totalRevenue)}</td>
              <td className="px-3 py-2 text-right tabular-nums">—</td>
            </tr>

            {/* COGS header */}
            <tr className="border-t">
              <td className="px-3 py-2 sticky left-0 bg-neutral-950 font-medium">Cost of Revenue</td>
              {colMonths.map((m) => (
                <td key={m} className="px-3 py-2 text-right tabular-nums">{cell(cogs(m))}</td>
              ))}
              <td className="px-3 py-2 text-right tabular-nums font-medium">{cell(totalCOGS)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{pctCell(totalRevenue !== 0 ? (totalCOGS / totalRevenue) * 100 : 0)}</td>
            </tr>

            {/* COGS subrows */}
            <tr className="border-t">
              <td className="px-3 py-2 sticky left-0 bg-neutral-950 pl-8 opacity-90">Food</td>
              {colMonths.map((m) => (
                <td key={m} className="px-3 py-2 text-right tabular-nums">{cell(food(m))}</td>
              ))}
              <td className="px-3 py-2 text-right tabular-nums">{cell(colMonths.reduce((a, m) => a + food(m), 0))}</td>
              <td className="px-3 py-2 text-right tabular-nums">{pctCell(totalRevenue !== 0 ? (colMonths.reduce((a, m) => a + food(m), 0) / totalRevenue) * 100 : 0)}</td>
            </tr>
            <tr className="border-t">
              <td className="px-3 py-2 sticky left-0 bg-neutral-950 pl-8 opacity-90">Beverage</td>
              {colMonths.map((m) => (
                <td key={m} className="px-3 py-2 text-right tabular-nums">{cell(beverage(m))}</td>
              ))}
              <td className="px-3 py-2 text-right tabular-nums">{cell(colMonths.reduce((a, m) => a + beverage(m), 0))}</td>
              <td className="px-3 py-2 text-right tabular-nums">{pctCell(totalRevenue !== 0 ? (colMonths.reduce((a, m) => a + beverage(m), 0) / totalRevenue) * 100 : 0)}</td>
            </tr>

            {/* Gross Profit */}
            <tr className="border-t">
              <td className="px-3 py-2 sticky left-0 bg-neutral-950 font-medium">Gross Profit</td>
              {colMonths.map((m) => (
                <td key={m} className="px-3 py-2 text-right tabular-nums">{cell(grossProfit(m))}</td>
              ))}
              <td className="px-3 py-2 text-right tabular-nums font-medium">{cell(totalGross)}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {pctCell(totalRevenue !== 0 ? (totalGross / totalRevenue) * 100 : 0)}
              </td>
            </tr>

            {/* Operating Expenses */}
            <tr className="border-t">
              <td className="px-3 py-2 sticky left-0 bg-neutral-950 font-medium">Operating Expenses</td>
              {colMonths.map((m) => (
                <td key={m} className="px-3 py-2 text-right tabular-nums">{cell(opex(m))}</td>
              ))}
              <td className="px-3 py-2 text-right tabular-nums font-medium">{cell(totalOpex)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{pctCell(totalRevenue !== 0 ? (totalOpex / totalRevenue) * 100 : 0)}</td>
            </tr>

            {/* Opex subrows */}
            <tr className="border-t">
              <td className="px-3 py-2 sticky left-0 bg-neutral-950 pl-8 opacity-90">Labor</td>
              {colMonths.map((m) => (
                <td key={m} className="px-3 py-2 text-right tabular-nums">{cell(labor(m))}</td>
              ))}
              <td className="px-3 py-2 text-right tabular-nums">{cell(colMonths.reduce((a, m) => a + labor(m), 0))}</td>
              <td className="px-3 py-2 text-right tabular-nums">{pctCell(totalRevenue !== 0 ? (colMonths.reduce((a, m) => a + labor(m), 0) / totalRevenue) * 100 : 0)}</td>
            </tr>
            <tr className="border-t">
              <td className="px-3 py-2 sticky left-0 bg-neutral-950 pl-8 opacity-90">Rent</td>
              {colMonths.map((m) => (
                <td key={m} className="px-3 py-2 text-right tabular-nums">{cell(rent(m))}</td>
              ))}
              <td className="px-3 py-2 text-right tabular-nums">{cell(colMonths.reduce((a, m) => a + rent(m), 0))}</td>
              <td className="px-3 py-2 text-right tabular-nums">{pctCell(totalRevenue !== 0 ? (colMonths.reduce((a, m) => a + rent(m), 0) / totalRevenue) * 100 : 0)}</td>
            </tr>
            <tr className="border-t">
              <td className="px-3 py-2 sticky left-0 bg-neutral-950 pl-8 opacity-90">Utilities</td>
              {colMonths.map((m) => (
                <td key={m} className="px-3 py-2 text-right tabular-nums">{cell(utilities(m))}</td>
              ))}
              <td className="px-3 py-2 text-right tabular-nums">{cell(colMonths.reduce((a, m) => a + utilities(m), 0))}</td>
              <td className="px-3 py-2 text-right tabular-nums">{pctCell(totalRevenue !== 0 ? (colMonths.reduce((a, m) => a + utilities(m), 0) / totalRevenue) * 100 : 0)}</td>
            </tr>
            <tr className="border-t">
              <td className="px-3 py-2 sticky left-0 bg-neutral-950 pl-8 opacity-90">Marketing</td>
              {colMonths.map((m) => (
                <td key={m} className="px-3 py-2 text-right tabular-nums">{cell(marketing(m))}</td>
              ))}
              <td className="px-3 py-2 text-right tabular-nums">{cell(colMonths.reduce((a, m) => a + marketing(m), 0))}</td>
              <td className="px-3 py-2 text-right tabular-nums">{pctCell(totalRevenue !== 0 ? (colMonths.reduce((a, m) => a + marketing(m), 0) / totalRevenue) * 100 : 0)}</td>
            </tr>
            <tr className="border-t">
              <td className="px-3 py-2 sticky left-0 bg-neutral-950 pl-8 opacity-90">Misc</td>
              {colMonths.map((m) => (
                <td key={m} className="px-3 py-2 text-right tabular-nums">{cell(misc(m))}</td>
              ))}
              <td className="px-3 py-2 text-right tabular-nums">{cell(colMonths.reduce((a, m) => a + misc(m), 0))}</td>
              <td className="px-3 py-2 text-right tabular-nums">{pctCell(totalRevenue !== 0 ? (colMonths.reduce((a, m) => a + misc(m), 0) / totalRevenue) * 100 : 0)}</td>
            </tr>

            {/* Net Income */}
            <tr className="border-t">
              <td className="px-3 py-2 sticky left-0 bg-neutral-950 font-semibold">Net Income</td>
              {colMonths.map((m) => {
                const n = netIncome(m);
                return (
                  <td key={m} className={`px-3 py-2 text-right tabular-nums font-medium ${n < 0 ? "text-rose-300" : ""}`}>
                    {cell(n)}
                  </td>
                );
              })}
              <td className={`px-3 py-2 text-right tabular-nums font-semibold ${totalNet < 0 ? "text-rose-300" : ""}`}>
                {cell(totalNet)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{pctCell(netMarginPct)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* Empty guidance */}
      {totalRevenue === 0 && expRows.length === 0 && (
        <div className="mt-4 text-sm opacity-80 border rounded px-4 py-3">
          No financial data in this range yet. Add data here:
          <span className="ml-2">
            <Link href="/sales" className="underline">Sales</Link> •{" "}
            <Link href="/expenses/manage" className="underline">Expenses</Link>
          </span>
        </div>
      )}
    </main>
  );
}
