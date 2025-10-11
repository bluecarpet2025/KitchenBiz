import "server-only";
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";

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

type SalesMonthRow = { month: string; revenue: number; orders: number };
type IncomeRow = {
  month: string;
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
/** Accepts both Next 15 promise-style and plain-object style searchParams */
export default async function FinancialPage(props: {
  searchParams?: Promise<Record<string, string>> | Record<string, string>;
}) {
  // Normalize search params (works in both runtimes)
  const spRaw =
    (props?.searchParams && typeof (props.searchParams as any)?.then === "function"
      ? await (props.searchParams as Promise<Record<string, string>>)
      : props?.searchParams) ?? {};
  const sp = (spRaw ?? {}) as Record<string, string>;

  const supabase = await createServerClient();

  // tenant
  const { data: u } = await supabase.auth.getUser();
  const uid = u?.user?.id;
  const { data: prof } = uid
    ? await supabase.from("profiles").select("tenant_id").eq("id", uid).maybeSingle()
    : { data: null as any };
  const tenantId = (prof?.tenant_id as string | undefined) ?? "";

  // resolve filter
  const now = new Date();

  // Defaults: current-year YTD
  const defaultStart = `${now.getUTCFullYear()}-01-01`;
  const defaultEnd = `${now.getUTCFullYear() + 1}-01-01`;

  const startIso = sp.start && /^\d{4}-\d{2}-\d{2}$/.test(sp.start) ? sp.start : defaultStart;
  const endIso = sp.end && /^\d{4}-\d{2}-\d{2}$/.test(sp.end) ? sp.end : defaultEnd;

  const startMonth = startIso.slice(0, 7);
  const endMonthExcl = endIso.slice(0, 7); // exclusive

  // build list of months [startMonth ... <endMonthExcl)
  const months: string[] = [];
  for (let m = startMonth; m < endMonthExcl; m = addMonths(m, 1)) {
    months.push(m);
    if (months.length > 120) break; // safety cap (10 years)
  }

  /* ---------------------------- fetch sales ---------------------------- */
  let salesRows: SalesMonthRow[] = [];
  if (tenantId && months.length) {
    const { data } = await supabase
      .from("v_sales_month_totals")
      .select("month, revenue, orders")
      .eq("tenant_id", tenantId)
      .gte("month", startMonth)
      .lt("month", endMonthExcl)
      .order("month", { ascending: true });
    salesRows =
      (data ?? []).map((r: any) => ({
        month: String(r.month),
        revenue: Number(r.revenue ?? 0),
        orders: Number(r.orders ?? 0),
      })) ?? [];
  }
  const salesByMonth = new Map(salesRows.map((r) => [r.month, r.revenue]));
  const ordersByMonth = new Map(salesRows.map((r) => [r.month, r.orders]));

  /* -------------------------- fetch expenses -------------------------- */
  const { data: expRows } = await supabase
    .from("expenses")
    .select("occurred_at, amount_usd, category")
    .eq("tenant_id", tenantId)
    .gte("occurred_at", `${startIso}T00:00:00Z`)
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
    // Aggregate the same window (selected range) for “YTD” mix shown on the right
    ytdBucket[c] += amt;
  }

  /* ---------------- This Month & YTD (calendar) cards ----------------- */
  const thisMonth = `${now.getUTCFullYear()}-${pad2(now.getUTCMonth() + 1)}`;
  const thisYear = String(now.getUTCFullYear());

  const cardMonthKey = thisMonth;
  const cardMonthSales = Number(salesByMonth.get(cardMonthKey) || 0);
  const cardMonthOrders = Number(ordersByMonth.get(cardMonthKey) || 0);
  const cardMonthExp = Object.values(expByMonth.get(cardMonthKey) ?? {}).reduce((a, b) => a + b, 0);
  const cardMonthProfit = cardMonthSales - cardMonthExp;
  const cardMonthAOV = cardMonthOrders > 0 ? cardMonthSales / cardMonthOrders : 0;

  const ytdMonths = months.filter((m) => m.startsWith(thisYear));
  const ytdSales = ytdMonths.reduce((a, m) => a + Number(salesByMonth.get(m) || 0), 0);
  const ytdOrders = ytdMonths.reduce((a, m) => a + Number(ordersByMonth.get(m) || 0), 0);
  const ytdExpenses = ytdMonths.reduce(
    (a, m) => a + Object.values(expByMonth.get(m) ?? {}).reduce((x, y) => x + y, 0),
    0
  );
  const ytdProfit = ytdSales - ytdExpenses;
  const ytdAOV = ytdOrders > 0 ? ytdSales / ytdOrders : 0;

  /* ---------------- Trailing months series & income table -------------- */
  const lineSeries = months.map((m) => {
    const s = Number(salesByMonth.get(m) || 0);
    const e = Object.values(expByMonth.get(m) ?? {}).reduce((a, b) => a + b, 0);
    return { key: m, sales: s, expenses: e, profit: s - e };
  });

  const incomeRows: IncomeRow[] = months.map((m) => {
    const exp = expByMonth.get(m) ?? { Food: 0, Labor: 0, Rent: 0, Utilities: 0, Marketing: 0, Misc: 0 };
    const sales = Number(salesByMonth.get(m) || 0);
    const total = Object.values(exp).reduce((a, b) => a + b, 0);
    return {
      month: m,
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

  const q = new URLSearchParams({ start: startIso, end: endIso }).toString();

  return (
    <main className="max-w-6xl mx-auto px-4 py-6">
      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="text-xl font-semibold mr-4">Financials</div>

        <label className="text-xs opacity-70">Start (UTC)</label>
        <form action="/financial" className="contents">
          <input
            type="date"
            name="start"
            defaultValue={startIso}
            className="border rounded px-2 h-10 bg-transparent"
          />
          <label className="text-xs opacity-70 ml-2">End (UTC)</label>
          <input type="date" name="end" defaultValue={endIso} className="border rounded px-2 h-10 bg-transparent" />
          <button className="border rounded px-3 h-10 hover:bg-neutral-900 ml-2">Apply</button>
        </form>

        <div className="flex-1" />

        <a
          href={`/api/accounting/export?${q}`}
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

      {/* Top cards */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="border rounded p-4">
          <div className="opacity-70 text-xs">THIS MONTH — SALES</div>
          <div className="text-2xl font-semibold">{fmtUSD(cardMonthSales)}</div>
          <div className="text-xs mt-1 opacity-80">
            Orders: {cardMonthOrders} · AOV: {fmtUSD(cardMonthAOV)}
          </div>
        </div>

        <div className="border rounded p-4">
          <div className="opacity-70 text-xs">THIS MONTH — EXPENSES</div>
          <div className="text-2xl font-semibold">{fmtUSD(cardMonthExp)}</div>
          <div className="text-xs mt-1 opacity-80">
            Food + Labor share:{" "}
            {(() => {
              const exp = expByMonth.get(cardMonthKey) ?? {
                Food: 0,
                Labor: 0,
                Rent: 0,
                Utilities: 0,
                Marketing: 0,
                Misc: 0,
              };
              const pct = (exp.Food + exp.Labor) / Math.max(1, cardMonthSales);
              return `${Math.round(pct * 100)}%`;
            })()}
          </div>
        </div>

        <div className="border rounded p-4">
          <div className="opacity-70 text-xs">THIS MONTH — PROFIT / LOSS</div>
          <div className={`text-2xl font-semibold ${cardMonthProfit < 0 ? "text-rose-400" : ""}`}>
            {fmtUSD(cardMonthProfit)}
          </div>
          <div className="text-xs mt-1 opacity-80">
            Margin: {Math.round((cardMonthSales > 0 ? (cardMonthProfit / cardMonthSales) * 100 : 0))}%
          </div>
        </div>

        <div className="border rounded p-4">
          <div className="opacity-70 text-xs">YEAR TO DATE — SALES</div>
          <div className="text-2xl font-semibold">{fmtUSD(ytdSales)}</div>
          <div className="text-xs mt-1 opacity-80">
            Orders: {ytdOrders} · AOV: {fmtUSD(ytdAOV)}
          </div>
        </div>

        <div className="border rounded p-4">
          <div className="opacity-70 text-xs">YEAR TO DATE — EXPENSES</div>
          <div className="text-2xl font-semibold">{fmtUSD(ytdExpenses)}</div>
          <div className="text-xs mt-1 opacity-80">
            Expense % of sales: {Math.round((ytdSales > 0 ? (ytdExpenses / ytdSales) * 100 : 0))}% · Prime %:{" "}
            {Math.round((ytdSales > 0 ? ((ytdBucket.Food + ytdBucket.Labor) / ytdSales) * 100 : 0))}%
          </div>
        </div>

        <div className="border rounded p-4">
          <div className="opacity-70 text-xs">YEAR TO DATE — PROFIT / LOSS</div>
          <div className={`text-2xl font-semibold ${ytdProfit < 0 ? "text-rose-400" : ""}`}>{fmtUSD(ytdProfit)}</div>
          <div className="text-xs mt-1 opacity-80">Margin: {Math.round((ytdSales > 0 ? (ytdProfit / ytdSales) * 100 : 0))}%</div>
        </div>
      </section>

      {/* Charts row */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <div className="border rounded p-4">
          <div className="text-sm opacity-80 mb-2">Trailing months — Sales vs Expenses</div>
          <div className="h-48">
            {(() => {
              const width = 600;
              const height = 180;
              const left = 36;
              const right = 6;
              const top = 10;
              const bottom = 22;
              const W = width - left - right;
              const H = height - top - bottom;
              const max = Math.max(1, ...lineSeries.flatMap((r) => [r.sales, r.expenses]));
              const dx = lineSeries.length > 1 ? W / (lineSeries.length - 1) : 0;
              const scaleY = (v: number) => top + H - (v / max) * H;
              const xs = lineSeries.map((_, i) => left + i * dx);

              const path = (key: "sales" | "expenses") =>
                lineSeries
                  .map((r, i) => `${i ? "L" : "M"} ${xs[i].toFixed(1)} ${scaleY(r[key]).toFixed(1)}`)
                  .join(" ");

              return (
                <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full">
                  <line x1={left} y1={top} x2={left} y2={top + H} stroke="#2a2a2a" />
                  <line x1={left} y1={top + H} x2={left + W} y2={top + H} stroke="#2a2a2a" />
                  <path d={path("expenses")} fill="none" stroke="#4da3ff" strokeWidth="2" />
                  <path d={path("sales")} fill="none" stroke="#3ea65f" strokeWidth="2" />
                </svg>
              );
            })()}
          </div>
        </div>

        <div className="border rounded p-4">
          <div className="text-sm opacity-80 mb-2">YTD expense mix</div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex justify-between border rounded px-2 py-1">
              <span>Marketing</span> <span>{fmtUSD(ytdBucket.Marketing)}</span>
            </div>
            <div className="flex justify-between border rounded px-2 py-1">
              <span>Rent</span> <span>{fmtUSD(ytdBucket.Rent)}</span>
            </div>
            <div className="flex justify-between border rounded px-2 py-1">
              <span>Food</span> <span>{fmtUSD(ytdBucket.Food)}</span>
            </div>
            <div className="flex justify-between border rounded px-2 py-1">
              <span>Labor</span> <span>{fmtUSD(ytdBucket.Labor)}</span>
            </div>
            <div className="flex justify-between border rounded px-2 py-1">
              <span>Misc</span> <span>{fmtUSD(ytdBucket.Misc)}</span>
            </div>
            <div className="flex justify-between border rounded px-2 py-1">
              <span>Utilities</span> <span>{fmtUSD(ytdBucket.Utilities)}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Income statement */}
      <section className="border rounded mt-4 overflow-x-auto">
        <div className="px-4 py-3 border-b text-sm opacity-80">Income Statement — by month</div>
        <table className="w-full text-sm">
          <thead className="opacity-80">
            <tr>
              <th className="text-left font-normal px-2 py-1">Month</th>
              <th className="text-right font-normal px-2 py-1">Sales</th>
              <th className="text-right font-normal px-2 py-1">Food</th>
              <th className="text-right font-normal px-2 py-1">Labor</th>
              <th className="text-right font-normal px-2 py-1">Rent</th>
              <th className="text-right font-normal px-2 py-1">Utilities</th>
              <th className="text-right font-normal px-2 py-1">Marketing</th>
              <th className="text-right font-normal px-2 py-1">Misc</th>
              <th className="text-right font-normal px-2 py-1">Total Expenses</th>
              <th className="text-right font-normal px-2 py-1">Profit</th>
            </tr>
          </thead>
          <tbody>
            {incomeRows.map((r) => (
              <tr key={r.month} className="border-t">
                <td className="px-2 py-1">{r.month}</td>
                <td className="px-2 py-1 text-right">{fmtUSD(r.sales)}</td>
                <td className="px-2 py-1 text-right">{fmtUSD(r.food)}</td>
                <td className="px-2 py-1 text-right">{fmtUSD(r.labor)}</td>
                <td className="px-2 py-1 text-right">{fmtUSD(r.rent)}</td>
                <td className="px-2 py-1 text-right">{fmtUSD(r.utilities)}</td>
                <td className="px-2 py-1 text-right">{fmtUSD(r.marketing)}</td>
                <td className="px-2 py-1 text-right">{fmtUSD(r.misc)}</td>
                <td className="px-2 py-1 text-right">{fmtUSD(r.total_expenses)}</td>
                <td className={`px-2 py-1 text-right ${r.profit < 0 ? "text-rose-400" : ""}`}>{fmtUSD(r.profit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
