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

function pct(n: number) {
  if (!Number.isFinite(n)) return "0%";
  return `${Math.round(n * 100)}%`;
}

function classTab(active: boolean) {
  return [
    "inline-flex items-center h-10 px-3 rounded border text-sm",
    active ? "border-emerald-700 bg-emerald-900/10 text-emerald-200" : "border-neutral-800 hover:bg-neutral-900",
  ].join(" ");
}

function lockedBadge() {
  return (
    <span className="inline-flex items-center gap-2 text-[11px] px-2 py-0.5 rounded-full border border-amber-600/40 bg-amber-900/10 text-amber-200">
      <span className="h-2 w-2 rounded-full bg-amber-400" />
      Locked
    </span>
  );
}

type SalesMonthRow = { month: string; revenue: number; orders: number };

type IncomeRow = {
  month: string;
  locked: boolean;
  sales: number;
  food: number;
  labor: number;
  rent: number;
  utilities: number;
  marketing: number;
  misc: number;
  total_expenses: number;
  profit: number;
};

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

  // Tabs
  const tab = (sp.tab || "income").toLowerCase(); // income | trends | expenses

  // Starter cutoff: rolling last 3 months (UTC)
  const now = new Date();
  const cutoff = addMonthsUTC(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())), -3);
  const cutoffIso = `${cutoff.getUTCFullYear()}-${pad2(cutoff.getUTCMonth() + 1)}-${pad2(cutoff.getUTCDate())}`;

  // Defaults: current-year YTD
  const defaultStart = `${now.getUTCFullYear()}-01-01`;
  const defaultEnd = `${now.getUTCFullYear() + 1}-01-01`;

  const startIso = sp.start && /^\d{4}-\d{2}-\d{2}$/.test(sp.start) ? sp.start : defaultStart;
  const endIso = sp.end && /^\d{4}-\d{2}-\d{2}$/.test(sp.end) ? sp.end : defaultEnd;

  const startMonth = startIso.slice(0, 7);
  const endMonthExcl = endIso.slice(0, 7); // exclusive

  // Month list [startMonth ... <endMonthExcl)
  const months: string[] = [];
  for (let m = startMonth; m < endMonthExcl; m = addMonths(m, 1)) {
    months.push(m);
    if (months.length > 120) break;
  }

  const monthStartIso = (m: string) => `${m}-01`;

  // For Starter: only query >= cutoff, but keep the full month list
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

  const expByMonth = new Map<
    string,
    { Food: number; Labor: number; Rent: number; Utilities: number; Marketing: number; Misc: number }
  >();

  const ytdBucket = { Food: 0, Labor: 0, Rent: 0, Utilities: 0, Marketing: 0, Misc: 0 };

  function catKey(c: string | null): keyof typeof ytdBucket {
    const k = String(c ?? "").trim().toLowerCase();
    if (k === "food") return "Food";
    if (k === "labor") return "Labor";
    if (k === "rent") return "Rent";
    if (k === "utilities") return "Utilities";
    if (k === "marketing") return "Marketing";
    return "Misc";
  }

  for (const r of expRows ?? []) {
    const dt = new Date((r as any).occurred_at);
    const k = `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}`;
    const c = catKey((r as any).category);
    const amt = Number((r as any).amount_usd || 0);

    if (!expByMonth.has(k)) expByMonth.set(k, { Food: 0, Labor: 0, Rent: 0, Utilities: 0, Marketing: 0, Misc: 0 });
    expByMonth.get(k)![c] += amt;
    ytdBucket[c] += amt;
  }

  /* ---------------- This Month & YTD cards ----------------- */
  const thisMonth = `${now.getUTCFullYear()}-${pad2(now.getUTCMonth() + 1)}`;
  const thisYear = String(now.getUTCFullYear());

  const cardMonthSales = Number(salesByMonth.get(thisMonth) || 0);
  const cardMonthOrders = Number(ordersByMonth.get(thisMonth) || 0);
  const cardMonthExp = Object.values(expByMonth.get(thisMonth) ?? {}).reduce((a, b) => a + b, 0);
  const cardMonthProfit = cardMonthSales - cardMonthExp;
  const cardMonthAOV = cardMonthOrders > 0 ? cardMonthSales / cardMonthOrders : 0;

  const ytdMonths = months.filter((m) => m.startsWith(thisYear));
  const ytdSales = ytdMonths.reduce((a, m) => a + (isStarter && monthStartIso(m) < cutoffIso ? 0 : Number(salesByMonth.get(m) || 0)), 0);
  const ytdOrders = ytdMonths.reduce((a, m) => a + (isStarter && monthStartIso(m) < cutoffIso ? 0 : Number(ordersByMonth.get(m) || 0)), 0);
  const ytdExpenses = ytdMonths.reduce((a, m) => {
    if (isStarter && monthStartIso(m) < cutoffIso) return a;
    return a + Object.values(expByMonth.get(m) ?? {}).reduce((x, y) => x + y, 0);
  }, 0);
  const ytdProfit = ytdSales - ytdExpenses;
  const ytdAOV = ytdOrders > 0 ? ytdSales / ytdOrders : 0;

  /* ---------------- Series & income table -------------- */
  const lineSeries = months.map((m) => {
    const isLocked = isStarter && monthStartIso(m) < cutoffIso;
    const s = isLocked ? 0 : Number(salesByMonth.get(m) || 0);
    const e = isLocked ? 0 : Object.values(expByMonth.get(m) ?? {}).reduce((a, b) => a + b, 0);
    return { key: m, locked: isLocked, sales: s, expenses: e, profit: s - e };
  });

  const incomeRows: IncomeRow[] = months.map((m) => {
    const isLocked = isStarter && monthStartIso(m) < cutoffIso;
    const exp = isLocked
      ? { Food: 0, Labor: 0, Rent: 0, Utilities: 0, Marketing: 0, Misc: 0 }
      : expByMonth.get(m) ?? { Food: 0, Labor: 0, Rent: 0, Utilities: 0, Marketing: 0, Misc: 0 };
    const sales = isLocked ? 0 : Number(salesByMonth.get(m) || 0);
    const total = Object.values(exp).reduce((a, b) => a + b, 0);

    return {
      month: m,
      locked: isLocked,
      sales,
      food: exp.Food,
      labor: exp.Labor,
      rent: exp.Rent,
      utilities: exp.Utilities,
      marketing: exp.Marketing,
      misc: exp.Misc,
      total_expenses: total,
      profit: sales - total,
    };
  });

  // Totals (only unlocked months)
  const totals = incomeRows.reduce(
    (acc, r) => {
      if (r.locked) return acc;
      acc.sales += r.sales;
      acc.food += r.food;
      acc.labor += r.labor;
      acc.rent += r.rent;
      acc.utilities += r.utilities;
      acc.marketing += r.marketing;
      acc.misc += r.misc;
      acc.total_expenses += r.total_expenses;
      acc.profit += r.profit;
      return acc;
    },
    {
      sales: 0,
      food: 0,
      labor: 0,
      rent: 0,
      utilities: 0,
      marketing: 0,
      misc: 0,
      total_expenses: 0,
      profit: 0,
    }
  );

  const profitMargin = totals.sales > 0 ? totals.profit / totals.sales : 0;
  const primeCostPct = totals.sales > 0 ? (totals.food + totals.labor) / totals.sales : 0;
  const expensePct = totals.sales > 0 ? totals.total_expenses / totals.sales : 0;

  const qBase = new URLSearchParams({ start: startIso, end: endIso });
  const tabHref = (t: string) => `/financial?${new URLSearchParams({ ...Object.fromEntries(qBase.entries()), tab: t }).toString()}`;

  return (
    <main className="max-w-6xl mx-auto px-4 py-6">
      {/* Header row */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <div className="text-xl font-semibold mr-4">Financials</div>

        <form action="/financial" className="contents">
          <input type="hidden" name="tab" value={tab} />
          <label className="text-xs opacity-70">Start (UTC)</label>
          <input type="date" name="start" defaultValue={startIso} className="border rounded px-2 h-10 bg-transparent" />
          <label className="text-xs opacity-70 ml-2">End (UTC)</label>
          <input type="date" name="end" defaultValue={endIso} className="border rounded px-2 h-10 bg-transparent" />
          <button className="border rounded px-3 h-10 hover:bg-neutral-900 ml-2">Apply</button>
        </form>

        <div className="flex-1" />

        <a
          href={`/api/accounting/export?${qBase.toString()}`}
          className="border rounded px-3 h-10 flex items-center hover:bg-neutral-900"
        >
          Download Tax Pack
        </a>

        <Link href="/sales" className="border rounded px-3 h-10 flex items-center hover:bg-neutral-900">
          Sales details
        </Link>

        <Link href="/expenses" className="border rounded px-3 h-10 flex items-center hover:bg-neutral-900">
          Expenses details
        </Link>
      </div>

      {isStarter && (
        <div className="mb-4 text-xs rounded border border-amber-600/40 bg-amber-900/10 px-3 py-2 text-amber-200">
          Starter shows the last 3 months only. Older periods are marked as <strong>Locked</strong>.{" "}
          <Link href="/profile" className="underline">
            Upgrade to Basic
          </Link>{" "}
          for full history.
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
        <Link href={tabHref("income")} className={classTab(tab === "income")}>
          Income Statement
        </Link>
        <Link href={tabHref("trends")} className={classTab(tab === "trends")}>
          Trends
        </Link>
        <Link href={tabHref("expenses")} className={classTab(tab === "expenses")}>
          Expenses
        </Link>
      </div>

      {/* KPI cards (always visible) */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="border rounded p-4">
          <div className="opacity-70 text-xs">THIS MONTH — SALES</div>
          <div className="text-2xl font-semibold">{fmtUSD(cardMonthSales)}</div>
          <div className="text-xs mt-1 opacity-80">Orders: {cardMonthOrders} · AOV: {fmtUSD(cardMonthAOV)}</div>
        </div>

        <div className="border rounded p-4">
          <div className="opacity-70 text-xs">THIS MONTH — EXPENSES</div>
          <div className="text-2xl font-semibold">{fmtUSD(cardMonthExp)}</div>
          <div className="text-xs mt-1 opacity-80">
            Food + Labor share:{" "}
            {(() => {
              const exp = expByMonth.get(thisMonth) ?? {
                Food: 0,
                Labor: 0,
                Rent: 0,
                Utilities: 0,
                Marketing: 0,
                Misc: 0,
              };
              const pctVal = (exp.Food + exp.Labor) / Math.max(1, cardMonthSales);
              return pct(pctVal);
            })()}
          </div>
        </div>

        <div className="border rounded p-4">
          <div className="opacity-70 text-xs">THIS MONTH — PROFIT / LOSS</div>
          <div className={`text-2xl font-semibold ${cardMonthProfit < 0 ? "text-rose-400" : ""}`}>
            {fmtUSD(cardMonthProfit)}
          </div>
          <div className="text-xs mt-1 opacity-80">
            Margin: {pct(cardMonthSales > 0 ? cardMonthProfit / cardMonthSales : 0)}
          </div>
        </div>

        <div className="border rounded p-4">
          <div className="opacity-70 text-xs">YEAR TO DATE — SALES</div>
          <div className="text-2xl font-semibold">{fmtUSD(ytdSales)}</div>
          <div className="text-xs mt-1 opacity-80">Orders: {ytdOrders} · AOV: {fmtUSD(ytdAOV)}</div>
        </div>

        <div className="border rounded p-4">
          <div className="opacity-70 text-xs">YEAR TO DATE — EXPENSES</div>
          <div className="text-2xl font-semibold">{fmtUSD(ytdExpenses)}</div>
          <div className="text-xs mt-1 opacity-80">
            Expense % of sales: {pct(ytdSales > 0 ? ytdExpenses / ytdSales : 0)} · Prime %:{" "}
            {pct(ytdSales > 0 ? (ytdBucket.Food + ytdBucket.Labor) / ytdSales : 0)}
          </div>
        </div>

        <div className="border rounded p-4">
          <div className="opacity-70 text-xs">YEAR TO DATE — PROFIT / LOSS</div>
          <div className={`text-2xl font-semibold ${ytdProfit < 0 ? "text-rose-400" : ""}`}>{fmtUSD(ytdProfit)}</div>
          <div className="text-xs mt-1 opacity-80">Margin: {pct(ytdSales > 0 ? ytdProfit / ytdSales : 0)}</div>
        </div>
      </section>

      {/* ===================== TAB: INCOME STATEMENT ===================== */}
      {tab === "income" && (
        <section className="border rounded mt-4 overflow-x-auto">
          <div className="px-4 py-3 border-b text-sm opacity-80">Income Statement — by month</div>

          <table className="w-full text-sm">
            <thead className="opacity-80 sticky top-0 bg-neutral-950">
              <tr>
                <th className="text-left font-normal px-2 py-2">Month</th>
                <th className="text-right font-normal px-2 py-2">Sales</th>
                <th className="text-right font-normal px-2 py-2">Food</th>
                <th className="text-right font-normal px-2 py-2">Labor</th>
                <th className="text-right font-normal px-2 py-2">Rent</th>
                <th className="text-right font-normal px-2 py-2">Utilities</th>
                <th className="text-right font-normal px-2 py-2">Marketing</th>
                <th className="text-right font-normal px-2 py-2">Misc</th>
                <th className="text-right font-normal px-2 py-2">Total Expenses</th>
                <th className="text-right font-normal px-2 py-2">Net Profit</th>
              </tr>
            </thead>

            <tbody>
              {incomeRows.map((r) => (
                <tr key={r.month} className="border-t">
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-2">
                      <span>{r.month}</span>
                      {r.locked ? lockedBadge() : null}
                    </div>
                  </td>

                  {/* For locked months, show Locked rather than fake $0 */}
                  <td className="px-2 py-2 text-right">{r.locked ? "—" : fmtUSD(r.sales)}</td>
                  <td className="px-2 py-2 text-right">{r.locked ? "—" : fmtUSD(r.food)}</td>
                  <td className="px-2 py-2 text-right">{r.locked ? "—" : fmtUSD(r.labor)}</td>
                  <td className="px-2 py-2 text-right">{r.locked ? "—" : fmtUSD(r.rent)}</td>
                  <td className="px-2 py-2 text-right">{r.locked ? "—" : fmtUSD(r.utilities)}</td>
                  <td className="px-2 py-2 text-right">{r.locked ? "—" : fmtUSD(r.marketing)}</td>
                  <td className="px-2 py-2 text-right">{r.locked ? "—" : fmtUSD(r.misc)}</td>
                  <td className="px-2 py-2 text-right">{r.locked ? "—" : fmtUSD(r.total_expenses)}</td>
                  <td className={`px-2 py-2 text-right ${!r.locked && r.profit < 0 ? "text-rose-400" : ""}`}>
                    {r.locked ? "—" : fmtUSD(r.profit)}
                  </td>
                </tr>
              ))}

              {/* Totals + ratios */}
              <tr className="border-t">
                <td className="px-2 py-3 font-medium">Total (selected range)</td>
                <td className="px-2 py-3 text-right font-medium">{fmtUSD(totals.sales)}</td>
                <td className="px-2 py-3 text-right font-medium">{fmtUSD(totals.food)}</td>
                <td className="px-2 py-3 text-right font-medium">{fmtUSD(totals.labor)}</td>
                <td className="px-2 py-3 text-right font-medium">{fmtUSD(totals.rent)}</td>
                <td className="px-2 py-3 text-right font-medium">{fmtUSD(totals.utilities)}</td>
                <td className="px-2 py-3 text-right font-medium">{fmtUSD(totals.marketing)}</td>
                <td className="px-2 py-3 text-right font-medium">{fmtUSD(totals.misc)}</td>
                <td className="px-2 py-3 text-right font-medium">{fmtUSD(totals.total_expenses)}</td>
                <td className={`px-2 py-3 text-right font-medium ${totals.profit < 0 ? "text-rose-400" : ""}`}>
                  {fmtUSD(totals.profit)}
                </td>
              </tr>

              <tr className="border-t">
                <td className="px-2 py-2 opacity-80">Key ratios</td>
                <td className="px-2 py-2 text-right opacity-80">Profit margin: {pct(profitMargin)}</td>
                <td className="px-2 py-2 text-right opacity-80">Prime cost: {pct(primeCostPct)}</td>
                <td className="px-2 py-2 text-right opacity-80" colSpan={2}>
                  Expense %: {pct(expensePct)}
                </td>
                <td className="px-2 py-2" colSpan={5} />
              </tr>
            </tbody>
          </table>
        </section>
      )}

      {/* ===================== TAB: TRENDS ===================== */}
      {tab === "trends" && (
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <div className="border rounded p-4">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="text-sm opacity-80">Sales vs Expenses (selected range)</div>
              <div className="text-[11px] opacity-70">
                <span className="inline-flex items-center gap-2 mr-3">
                  <span className="h-2 w-2 rounded-full bg-[#3ea65f]" /> Sales
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[#4da3ff]" /> Expenses
                </span>
              </div>
            </div>

            <div className="h-52">
              {(() => {
                // Only chart unlocked points for Starter. (Avoids a misleading $0 baseline.)
                const pts = lineSeries.filter((r) => !r.locked);
                const width = 700,
                  height = 200,
                  left = 42,
                  right = 10,
                  top = 10,
                  bottom = 28;
                const W = width - left - right,
                  H = height - top - bottom;

                const max = Math.max(1, ...pts.flatMap((r) => [r.sales, r.expenses]));
                const dx = pts.length > 1 ? W / (pts.length - 1) : 0;
                const scaleY = (v: number) => top + H - (v / max) * H;

                const xs = pts.map((_, i) => left + i * dx);
                const path = (key: "sales" | "expenses") =>
                  pts
                    .map((r, i) => `${i ? "L" : "M"} ${xs[i].toFixed(1)} ${scaleY(r[key]).toFixed(1)}`)
                    .join(" ");

                const y0 = top + H;

                // simple x labels: first + last
                const firstLabel = pts[0]?.key ?? "";
                const lastLabel = pts[pts.length - 1]?.key ?? "";

                return (
                  <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full">
                    <line x1={left} y1={top} x2={left} y2={top + H} stroke="#2a2a2a" />
                    <line x1={left} y1={y0} x2={left + W} y2={y0} stroke="#2a2a2a" />

                    <path d={path("expenses")} fill="none" stroke="#4da3ff" strokeWidth="2" />
                    <path d={path("sales")} fill="none" stroke="#3ea65f" strokeWidth="2" />

                    {firstLabel ? (
                      <text x={left} y={height - 8} fontSize="10" fill="#8a8a8a">
                        {firstLabel}
                      </text>
                    ) : null}
                    {lastLabel ? (
                      <text x={left + W} y={height - 8} fontSize="10" fill="#8a8a8a" textAnchor="end">
                        {lastLabel}
                      </text>
                    ) : null}
                  </svg>
                );
              })()}
            </div>

            {isStarter && (
              <div className="text-xs opacity-70 mt-2">
                Starter charts exclude locked months.{" "}
                <Link href="/profile" className="underline">
                  Upgrade to Basic
                </Link>{" "}
                for full history.
              </div>
            )}
          </div>

          <div className="border rounded p-4">
            <div className="text-sm opacity-80 mb-2">Expense mix (selected range)</div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex justify-between border rounded px-2 py-1">
                <span>Food</span>
                <span>{fmtUSD(totals.food)}</span>
              </div>
              <div className="flex justify-between border rounded px-2 py-1">
                <span>Labor</span>
                <span>{fmtUSD(totals.labor)}</span>
              </div>
              <div className="flex justify-between border rounded px-2 py-1">
                <span>Rent</span>
                <span>{fmtUSD(totals.rent)}</span>
              </div>
              <div className="flex justify-between border rounded px-2 py-1">
                <span>Utilities</span>
                <span>{fmtUSD(totals.utilities)}</span>
              </div>
              <div className="flex justify-between border rounded px-2 py-1">
                <span>Marketing</span>
                <span>{fmtUSD(totals.marketing)}</span>
              </div>
              <div className="flex justify-between border rounded px-2 py-1">
                <span>Misc</span>
                <span>{fmtUSD(totals.misc)}</span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ===================== TAB: EXPENSES ===================== */}
      {tab === "expenses" && (
        <section className="border rounded mt-4 overflow-x-auto">
          <div className="px-4 py-3 border-b text-sm opacity-80">Expenses — summary (selected range)</div>

          <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <div className="border rounded p-3">
              <div className="text-xs opacity-70">TOTAL EXPENSES</div>
              <div className="text-2xl font-semibold">{fmtUSD(totals.total_expenses)}</div>
              <div className="text-xs opacity-70 mt-1">Expense % of sales: {pct(expensePct)}</div>
            </div>

            <div className="border rounded p-3">
              <div className="text-xs opacity-70">PRIME COST</div>
              <div className="text-2xl font-semibold">{fmtUSD(totals.food + totals.labor)}</div>
              <div className="text-xs opacity-70 mt-1">Prime % of sales: {pct(primeCostPct)}</div>
            </div>

            <div className="border rounded p-3">
              <div className="text-xs opacity-70">NET PROFIT</div>
              <div className={`text-2xl font-semibold ${totals.profit < 0 ? "text-rose-400" : ""}`}>
                {fmtUSD(totals.profit)}
              </div>
              <div className="text-xs opacity-70 mt-1">Profit margin: {pct(profitMargin)}</div>
            </div>
          </div>

          <div className="px-4 pb-4">
            <div className="text-xs opacity-70 mb-2">
              Tip: categories come from Expenses. Anything that isn’t Food/Labor/Rent/Utilities/Marketing becomes Misc.
            </div>
            <Link href="/expenses" className="underline text-sm">
              Go to Expenses to edit categories →
            </Link>
          </div>
        </section>
      )}
    </main>
  );
}
