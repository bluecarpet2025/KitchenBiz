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
function addMonths(ymStr: string, delta: number) {
  const [y, m] = ymStr.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  d.setUTCMonth(d.getUTCMonth() + delta);
  return ym(d);
}
function addMonthsUTC(d: Date, n: number) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCMonth(x.getUTCMonth() + n);
  return x;
}
const maxIso = (a: string, b: string) => (a > b ? a : b);

type SalesMonthRow = { month: string; revenue: number; orders: number };

type ExpBuckets = {
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
  total_expenses: number;
  profit: number;
};

function monthStartIso(m: string) {
  return `${m}-01`;
}
function isoToYmdUTC(d: Date) {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}
function clampMonthsList(startMonth: string, endMonthExcl: string) {
  const months: string[] = [];
  for (let m = startMonth; m < endMonthExcl; m = addMonths(m, 1)) {
    months.push(m);
    if (months.length > 240) break; // safety
  }
  return months;
}
function monthsBetween(startMonth: string, endMonthExcl: string) {
  const months = clampMonthsList(startMonth, endMonthExcl);
  return months.length;
}
function addYearsIso(iso: string, years: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y + years, m - 1, d));
  return isoToYmdUTC(dt);
}
function startOfYearIsoUTC(d: Date) {
  return `${d.getUTCFullYear()}-01-01`;
}
function startOfMonthIsoUTC(d: Date) {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-01`;
}
function endOfMonthExclusiveIsoUTC(d: Date) {
  const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const next = addMonthsUTC(first, 1);
  return `${next.getUTCFullYear()}-${pad2(next.getUTCMonth() + 1)}-01`;
}
function safePctChange(prev: number, curr: number) {
  if (!Number.isFinite(prev) || !Number.isFinite(curr)) return 0;
  if (Math.abs(prev) < 0.000001) return curr === 0 ? 0 : 100;
  return ((curr - prev) / prev) * 100;
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
        <div className="text-xl font-semibold mb-2">Financials</div>
        <div className="text-sm opacity-70">Sign in to view financials.</div>
      </main>
    );
  }

  const plan = await effectivePlan();
  const isStarter = plan === "starter";

  // Starter cutoff: rolling last 3 months (UTC)
  const now = new Date();
  const cutoff = addMonthsUTC(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())), -3);
  const cutoffIso = isoToYmdUTC(cutoff);

  // Defaults
  const defaultStart = `${now.getUTCFullYear()}-01-01`;
  const defaultEnd = `${now.getUTCFullYear() + 1}-01-01`; // exclusive

  // Stock-style range chips (server-side)
  // NOTE: "ALL" is bounded by data query limits; we just set a far-back start.
  const range = (sp.range || "").toLowerCase();
  let startIso = sp.start && /^\d{4}-\d{2}-\d{2}$/.test(sp.start) ? sp.start : defaultStart;
  let endIso = sp.end && /^\d{4}-\d{2}-\d{2}$/.test(sp.end) ? sp.end : defaultEnd;

  // If user clicked a range chip, it overrides date inputs
  if (range) {
    if (range === "1m") {
      startIso = startOfMonthIsoUTC(now);
      endIso = endOfMonthExclusiveIsoUTC(now);
    } else if (range === "3m") {
      const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const start = addMonthsUTC(end, -2);
      startIso = isoToYmdUTC(start);
      endIso = isoToYmdUTC(addMonthsUTC(end, 1));
    } else if (range === "6m") {
      const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const start = addMonthsUTC(end, -5);
      startIso = isoToYmdUTC(start);
      endIso = isoToYmdUTC(addMonthsUTC(end, 1));
    } else if (range === "ytd") {
      startIso = startOfYearIsoUTC(now);
      endIso = `${now.getUTCFullYear() + 1}-01-01`;
    } else if (range === "1y") {
      // last 12 full months incl current month
      const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const start = addMonthsUTC(end, -11);
      startIso = isoToYmdUTC(start);
      endIso = isoToYmdUTC(addMonthsUTC(end, 1));
    } else if (range === "all") {
      startIso = "2000-01-01";
      endIso = defaultEnd; // current-year exclusive by default; user can still choose manual
      // better "ALL" UX: make it up to next month
      const nextMonth = addMonthsUTC(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), 1);
      endIso = isoToYmdUTC(nextMonth);
    }
  }

  // Metric selector (like stock page)
  const metric = (sp.metric || "profit").toLowerCase(); // profit | sales | expenses

  const startMonth = startIso.slice(0, 7);
  const endMonthExcl = endIso.slice(0, 7); // exclusive month bucket end

  const months = clampMonthsList(startMonth, endMonthExcl);

  // For Starter: only query >= cutoff, but keep the full month list and render old months as $0.
  const queryStartIso = isStarter ? maxIso(startIso, cutoffIso) : startIso;
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

  const expByMonth = new Map<string, ExpBuckets>();
  const ytdBucket: ExpBuckets = { Food: 0, Beverage: 0, Labor: 0, Rent: 0, Utilities: 0, Marketing: 0, Misc: 0 };

  function bucketForCategory(raw: string | null): keyof ExpBuckets {
    const k = String(raw ?? "").trim().toLowerCase();

    // Keep it simple and forgiving; users can type anything.
    if (k.includes("beverage") || k === "bev" || k.includes("drink")) return "Beverage";
    if (k.includes("food") || k.includes("ingredient") || k.includes("produce") || k.includes("meat")) return "Food";
    if (k.includes("labor") || k.includes("payroll") || k.includes("wage") || k.includes("staff")) return "Labor";
    if (k.includes("rent") || k.includes("lease")) return "Rent";
    if (k.includes("util") || k.includes("electric") || k.includes("water") || k.includes("gas") || k.includes("internet"))
      return "Utilities";
    if (k.includes("market") || k.includes("ads") || k.includes("promo")) return "Marketing";
    return "Misc";
  }

  for (const r of expRows ?? []) {
    const dt = new Date((r as any).occurred_at);
    const m = `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}`;
    const c = bucketForCategory((r as any).category);
    const amt = Number((r as any).amount_usd || 0); // negatives allowed; net expenses can be negative

    if (!expByMonth.has(m)) {
      expByMonth.set(m, { Food: 0, Beverage: 0, Labor: 0, Rent: 0, Utilities: 0, Marketing: 0, Misc: 0 });
    }
    expByMonth.get(m)![c] += amt;
    ytdBucket[c] += amt;
  }

  /* ---------------------------- period totals ---------------------------- */
  const isLockedMonth = (m: string) => isStarter && monthStartIso(m) < cutoffIso;

  const series = months.map((m) => {
    const locked = isLockedMonth(m);
    const sales = locked ? 0 : Number(salesByMonth.get(m) || 0);
    const exp = locked ? 0 : Object.values(expByMonth.get(m) ?? {}).reduce((a, b) => a + b, 0);
    const profit = sales - exp;
    return { key: m, sales, expenses: exp, profit };
  });

  const periodSales = series.reduce((a, r) => a + r.sales, 0);
  const periodExpenses = series.reduce((a, r) => a + r.expenses, 0);
  const periodProfit = series.reduce((a, r) => a + r.profit, 0);
  const periodOrders = months.reduce((a, m) => (isLockedMonth(m) ? a : a + Number(ordersByMonth.get(m) || 0)), 0);
  const periodAOV = periodOrders > 0 ? periodSales / periodOrders : 0;

  // Prior period (same month count) for delta like a stock quote
  const nMonths = monthsBetween(startMonth, endMonthExcl);
  const prevEndMonthExcl = startMonth;
  const prevStartMonth = addMonths(prevEndMonthExcl, -nMonths);

  const prevMonths = clampMonthsList(prevStartMonth, prevEndMonthExcl);
  const prevSeries = prevMonths.map((m) => {
    const locked = isLockedMonth(m);
    const sales = locked ? 0 : Number(salesByMonth.get(m) || 0);
    const exp = locked ? 0 : Object.values(expByMonth.get(m) ?? {}).reduce((a, b) => a + b, 0);
    const profit = sales - exp;
    return { key: m, sales, expenses: exp, profit };
  });

  const prevSales = prevSeries.reduce((a, r) => a + r.sales, 0);
  const prevExpenses = prevSeries.reduce((a, r) => a + r.expenses, 0);
  const prevProfit = prevSeries.reduce((a, r) => a + r.profit, 0);

  const headlineValue =
    metric === "sales" ? periodSales : metric === "expenses" ? periodExpenses : periodProfit;
  const prevHeadlineValue =
    metric === "sales" ? prevSales : metric === "expenses" ? prevExpenses : prevProfit;

  const delta = headlineValue - prevHeadlineValue;
  const pct = safePctChange(prevHeadlineValue, headlineValue);
  const deltaUp = delta >= 0;

  // This Month / YTD cards (still useful; keep them but visually secondary)
  const thisMonth = `${now.getUTCFullYear()}-${pad2(now.getUTCMonth() + 1)}`;
  const thisYear = String(now.getUTCFullYear());

  const cardMonthSales = Number(salesByMonth.get(thisMonth) || 0);
  const cardMonthOrders = Number(ordersByMonth.get(thisMonth) || 0);
  const cardMonthExp = Object.values(expByMonth.get(thisMonth) ?? {}).reduce((a, b) => a + b, 0);
  const cardMonthProfit = cardMonthSales - cardMonthExp;
  const cardMonthAOV = cardMonthOrders > 0 ? cardMonthSales / cardMonthOrders : 0;

  const ytdMonths = months.filter((m) => m.startsWith(thisYear));
  const ytdSales = ytdMonths.reduce((a, m) => a + (isLockedMonth(m) ? 0 : Number(salesByMonth.get(m) || 0)), 0);
  const ytdOrders = ytdMonths.reduce((a, m) => a + (isLockedMonth(m) ? 0 : Number(ordersByMonth.get(m) || 0)), 0);
  const ytdExpenses = ytdMonths.reduce((a, m) => {
    if (isLockedMonth(m)) return a;
    return a + Object.values(expByMonth.get(m) ?? {}).reduce((x, y) => x + y, 0);
  }, 0);
  const ytdProfit = ytdSales - ytdExpenses;

  const foodPct = periodSales > 0 ? (ytdBucket.Food / periodSales) * 100 : 0;
  const laborPct = periodSales > 0 ? (ytdBucket.Labor / periodSales) * 100 : 0;
  const primePct = periodSales > 0 ? ((ytdBucket.Food + ytdBucket.Beverage + ytdBucket.Labor) / periodSales) * 100 : 0;

  const q = new URLSearchParams({ start: startIso, end: endIso }).toString();

  // Chart data uses selected metric, like a stock chart
  const chartSeries = series.map((r) => ({
    key: r.key,
    value: metric === "sales" ? r.sales : metric === "expenses" ? r.expenses : r.profit,
  }));

  const chartMin = Math.min(0, ...chartSeries.map((r) => r.value));
  const chartMax = Math.max(1, ...chartSeries.map((r) => r.value));
  const chartRange = Math.max(1, chartMax - chartMin);

  // Income statement table rows
  const incomeRows: IncomeRow[] = months.map((m) => {
    const locked = isLockedMonth(m);
    const exp = locked
      ? { Food: 0, Beverage: 0, Labor: 0, Rent: 0, Utilities: 0, Marketing: 0, Misc: 0 }
      : expByMonth.get(m) ?? { Food: 0, Beverage: 0, Labor: 0, Rent: 0, Utilities: 0, Marketing: 0, Misc: 0 };

    const sales = locked ? 0 : Number(salesByMonth.get(m) || 0);
    const total = Object.values(exp).reduce((a, b) => a + b, 0);

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
      total_expenses: total,
      profit: sales - total,
    };
  });

  const Chip = ({ label, r }: { label: string; r: string }) => {
    const active = range === r.toLowerCase();
    const href = `/financial?${new URLSearchParams({
      range: r,
      metric,
    }).toString()}`;
    return (
      <Link
        href={href}
        className={`text-xs px-2 py-1 rounded-full border ${
          active ? "border-emerald-600/70 bg-emerald-900/20 text-emerald-200" : "border-neutral-800 text-neutral-300"
        } hover:bg-neutral-900`}
      >
        {label}
      </Link>
    );
  };

  const MetricBtn = ({ k, label }: { k: "profit" | "sales" | "expenses"; label: string }) => {
    const active = metric === k;
    const href = `/financial?${new URLSearchParams({
      start: startIso,
      end: endIso,
      metric: k,
      ...(range ? { range } : {}),
    }).toString()}`;
    return (
      <Link
        href={href}
        className={`text-xs px-3 py-2 rounded border ${
          active ? "border-neutral-600 bg-neutral-900/60 text-white" : "border-neutral-800 text-neutral-300"
        } hover:bg-neutral-900`}
      >
        {label}
      </Link>
    );
  };

  return (
    <main className="max-w-6xl mx-auto px-4 py-6">
      {/* Header row: title + range chips + actions */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="text-2xl font-semibold mr-2">Financials</div>

        {/* Range chips (stock-style) */}
        <div className="flex flex-wrap items-center gap-2">
          <Chip label="1M" r="1m" />
          <Chip label="3M" r="3m" />
          <Chip label="6M" r="6m" />
          <Chip label="YTD" r="ytd" />
          <Chip label="1Y" r="1y" />
          <Chip label="ALL" r="all" />
        </div>

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

      {/* Date filter row (keep for accountants) */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <label className="text-xs opacity-70">Start (UTC)</label>
        <form action="/financial" className="contents">
          <input type="date" name="start" defaultValue={startIso} className="border rounded px-2 h-10 bg-transparent" />
          <label className="text-xs opacity-70 ml-2">End (UTC)</label>
          <input type="date" name="end" defaultValue={endIso} className="border rounded px-2 h-10 bg-transparent" />
          <input type="hidden" name="metric" value={metric} />
          {range ? <input type="hidden" name="range" value={range} /> : null}
          <button className="border rounded px-3 h-10 hover:bg-neutral-900 ml-2">Apply</button>
        </form>
      </div>

      {isStarter && (
        <div className="mb-4 text-xs rounded border border-amber-600/40 bg-amber-900/10 px-3 py-2 text-amber-200">
          Starter shows last 3 months in visuals (older periods display $0).{" "}
          <Link href="/profile" className="underline">
            Upgrade to Basic
          </Link>{" "}
          for full history.
        </div>
      )}

      {/* Quote header (Yahoo-style) */}
      <section className="border rounded-xl p-4 mb-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex-1 min-w-[280px]">
            <div className="text-xs uppercase tracking-wide opacity-70">
              {metric === "sales" ? "Sales" : metric === "expenses" ? "Net Expenses" : "Profit / Loss"} •{" "}
              {months.length ? `${months[0]} → ${months[months.length - 1]}` : "No range"}
            </div>
            <div className="mt-2 flex items-end gap-3">
              <div className="text-4xl font-semibold tabular-nums">{fmtUSD(headlineValue)}</div>
              <div className={`text-sm tabular-nums ${deltaUp ? "text-emerald-300" : "text-rose-300"}`}>
                {deltaUp ? "+" : ""}
                {fmtUSD(delta)} ({deltaUp ? "+" : ""}
                {pct.toFixed(1)}%)
              </div>
            </div>
            <div className="text-xs opacity-70 mt-2">
              Compared to the prior period ({prevMonths.length ? `${prevMonths[0]} → ${prevMonths[prevMonths.length - 1]}` : "—"}).
            </div>
          </div>

          {/* Metric selector */}
          <div className="flex flex-col gap-2">
            <div className="text-xs opacity-70">Metric</div>
            <div className="flex gap-2">
              <MetricBtn k="profit" label="Profit" />
              <MetricBtn k="sales" label="Sales" />
              <MetricBtn k="expenses" label="Expenses" />
            </div>
          </div>
        </div>

        {/* Chart + Key stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          {/* Chart */}
          <div className="md:col-span-2 border rounded-lg p-3">
            <div className="text-sm opacity-80 mb-2">
              Trend — {metric === "sales" ? "Sales" : metric === "expenses" ? "Net Expenses" : "Profit / Loss"}
            </div>
            <div className="h-56">
              {(() => {
                const width = 720,
                  height = 220,
                  left = 38,
                  right = 10,
                  top = 10,
                  bottom = 26;
                const W = width - left - right;
                const H = height - top - bottom;
                const dx = chartSeries.length > 1 ? W / (chartSeries.length - 1) : 0;

                const scaleY = (v: number) => top + H - ((v - chartMin) / chartRange) * H;
                const xs = chartSeries.map((_, i) => left + i * dx);
                const d = chartSeries
                  .map((r, i) => `${i ? "L" : "M"} ${xs[i].toFixed(1)} ${scaleY(r.value).toFixed(1)}`)
                  .join(" ");

                // baseline at 0 for accuracy (important when negatives exist)
                const y0 = scaleY(0);

                return (
                  <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full">
                    {/* axes */}
                    <line x1={left} y1={top} x2={left} y2={top + H} stroke="#2a2a2a" />
                    <line x1={left} y1={top + H} x2={left + W} y2={top + H} stroke="#2a2a2a" />
                    {/* $0 baseline */}
                    <line x1={left} y1={y0} x2={left + W} y2={y0} stroke="#2a2a2a" strokeDasharray="4 4" />
                    {/* series */}
                    <path d={d} fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-300" />
                    {/* endpoints */}
                    {chartSeries.length > 0 ? (
                      <>
                        <circle cx={xs[0]} cy={scaleY(chartSeries[0].value)} r="2.5" fill="currentColor" className="text-emerald-300" />
                        <circle
                          cx={xs[xs.length - 1]}
                          cy={scaleY(chartSeries[chartSeries.length - 1].value)}
                          r="2.5"
                          fill="currentColor"
                          className="text-emerald-300"
                        />
                      </>
                    ) : null}
                  </svg>
                );
              })()}
            </div>
            <div className="text-[11px] opacity-60 mt-2">
              Note: expenses can be negative (credits/refunds) and reduce net expenses. Chart includes a $0 baseline for accuracy.
            </div>
          </div>

          {/* Key stats (calm, accountant-friendly) */}
          <div className="border rounded-lg p-3">
            <div className="text-sm opacity-80 mb-2">Key stats</div>
            <div className="space-y-2 text-sm">
              <Row label="Sales" value={fmtUSD(periodSales)} />
              <Row label="Net expenses" value={fmtUSD(periodExpenses)} />
              <Row label="Profit / loss" value={fmtUSD(periodProfit)} />
              <Row label="Orders" value={String(periodOrders)} />
              <Row label="AOV" value={fmtUSD(periodAOV)} />
              <Row label="Food %" value={`${Math.round(foodPct)}%`} />
              <Row label="Labor %" value={`${Math.round(laborPct)}%`} />
              <Row label="Prime cost %" value={`${Math.round(primePct)}%`} />
            </div>

            <div className="mt-4 border-t border-neutral-800 pt-3">
              <div className="text-xs opacity-70 mb-2">Expense mix (net)</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <Mini label="Food" v={ytdBucket.Food} />
                <Mini label="Beverage" v={ytdBucket.Beverage} />
                <Mini label="Labor" v={ytdBucket.Labor} />
                <Mini label="Rent" v={ytdBucket.Rent} />
                <Mini label="Utilities" v={ytdBucket.Utilities} />
                <Mini label="Marketing" v={ytdBucket.Marketing} />
                <div className="col-span-2">
                  <Mini label="Misc" v={ytdBucket.Misc} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Secondary cards (keep, but not the hero anymore) */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <Card title="THIS MONTH — SALES" value={fmtUSD(cardMonthSales)} sub={`Orders: ${cardMonthOrders} · AOV: ${fmtUSD(cardMonthAOV)}`} />
        <Card
          title="THIS MONTH — EXPENSES (NET)"
          value={fmtUSD(cardMonthExp)}
          sub={`Prime %: ${Math.round(cardMonthSales > 0 ? ((Number((expByMonth.get(thisMonth)?.Food ?? 0) + (expByMonth.get(thisMonth)?.Beverage ?? 0) + (expByMonth.get(thisMonth)?.Labor ?? 0)) / cardMonthSales) * 100) : 0)}%`}
        />
        <Card
          title="THIS MONTH — PROFIT / LOSS"
          value={fmtUSD(cardMonthProfit)}
          valueClass={cardMonthProfit < 0 ? "text-rose-300" : ""}
          sub={`Margin: ${Math.round(cardMonthSales > 0 ? (cardMonthProfit / cardMonthSales) * 100 : 0)}%`}
        />
        <Card title="YEAR TO DATE — SALES" value={fmtUSD(ytdSales)} sub={`Orders: ${ytdOrders} · AOV: ${fmtUSD(ytdOrders > 0 ? ytdSales / ytdOrders : 0)}`} />
        <Card
          title="YEAR TO DATE — EXPENSES (NET)"
          value={fmtUSD(ytdExpenses)}
          sub={`Expense %: ${Math.round(ytdSales > 0 ? (ytdExpenses / ytdSales) * 100 : 0)}% · Prime %: ${Math.round(ytdSales > 0 ? ((ytdBucket.Food + ytdBucket.Beverage + ytdBucket.Labor) / ytdSales) * 100 : 0)}%`}
        />
        <Card
          title="YEAR TO DATE — PROFIT / LOSS"
          value={fmtUSD(ytdProfit)}
          valueClass={ytdProfit < 0 ? "text-rose-300" : ""}
          sub={`Margin: ${Math.round(ytdSales > 0 ? (ytdProfit / ytdSales) * 100 : 0)}%`}
        />
      </section>

      {/* Income Statement (tables-first, collapsible) */}
      <section className="border rounded-xl overflow-hidden">
        <details open>
          <summary className="cursor-pointer select-none px-4 py-3 border-b text-sm opacity-80 bg-neutral-900/40">
            Income Statement — by month
          </summary>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="opacity-80">
                <tr>
                  <th className="text-left font-normal px-2 py-2">Month</th>
                  <th className="text-right font-normal px-2 py-2">Sales</th>
                  <th className="text-right font-normal px-2 py-2">Food</th>
                  <th className="text-right font-normal px-2 py-2">Beverage</th>
                  <th className="text-right font-normal px-2 py-2">Labor</th>
                  <th className="text-right font-normal px-2 py-2">Rent</th>
                  <th className="text-right font-normal px-2 py-2">Utilities</th>
                  <th className="text-right font-normal px-2 py-2">Marketing</th>
                  <th className="text-right font-normal px-2 py-2">Misc</th>
                  <th className="text-right font-normal px-2 py-2">Total Expenses</th>
                  <th className="text-right font-normal px-2 py-2">Profit</th>
                </tr>
              </thead>
              <tbody>
                {incomeRows.map((r) => (
                  <tr key={r.month} className="border-t">
                    <td className="px-2 py-1">{r.month}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{fmtUSD(r.sales)}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{fmtUSD(r.food)}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{fmtUSD(r.beverage)}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{fmtUSD(r.labor)}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{fmtUSD(r.rent)}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{fmtUSD(r.utilities)}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{fmtUSD(r.marketing)}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{fmtUSD(r.misc)}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{fmtUSD(r.total_expenses)}</td>
                    <td className={`px-2 py-1 text-right tabular-nums ${r.profit < 0 ? "text-rose-300" : ""}`}>
                      {fmtUSD(r.profit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>
    </main>
  );
}

/* ----------------------------- UI bits ----------------------------- */
function Card({
  title,
  value,
  sub,
  valueClass = "",
}: {
  title: string;
  value: string;
  sub: string;
  valueClass?: string;
}) {
  return (
    <div className="border rounded-lg p-4">
      <div className="opacity-70 text-xs">{title}</div>
      <div className={`text-2xl font-semibold tabular-nums ${valueClass}`}>{value}</div>
      <div className="text-xs mt-1 opacity-80">{sub}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="opacity-80">{label}</div>
      <div className="tabular-nums">{value}</div>
    </div>
  );
}

function Mini({ label, v }: { label: string; v: number }) {
  const fmt = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(Number(v) || 0);
  return (
    <div className="flex items-center justify-between border border-neutral-800 rounded px-2 py-1">
      <span className="opacity-80">{label}</span>
      <span className="tabular-nums">{fmt}</span>
    </div>
  );
}
