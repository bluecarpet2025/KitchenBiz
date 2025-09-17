// src/app/sales/page.tsx
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { getEffectiveTenant } from "@/lib/effective-tenant";
import { fmtUSD } from "@/lib/costing"; // already used across the app
export const dynamic = "force-dynamic";

type Order = {
  id: string;
  tenant_id: string;
  occurred_at: string | null;
  source: string | null;
  channel: string | null;
};

type Line = {
  id: string;
  tenant_id: string;
  order_id: string;
  product_name: string | null;
  qty: number | null;
  unit_price: number | null;
};

function periodKey(d: Date, mode: "day"|"week"|"month"|"quarter"|"year") {
  const y = d.getUTCFullYear();
  if (mode === "day") {
    return `${y}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")}`;
  }
  if (mode === "week") {
    // ISO week number
    const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const dayNum = (tmp.getUTCDay() + 6) % 7; // 0..6, Monday-based
    tmp.setUTCDate(tmp.getUTCDate() - dayNum + 3); // nearest Thu
    const week1 = new Date(Date.UTC(tmp.getUTCFullYear(),0,4));
    const wk = 1 + Math.round(((tmp.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getUTCDay()+6)%7)) / 7);
    return `${tmp.getUTCFullYear()}-W${String(wk).padStart(2,"0")}`;
  }
  if (mode === "month") {
    return `${y}-${String(d.getUTCMonth()+1).padStart(2,"0")}`;
  }
  if (mode === "quarter") {
    const q = Math.floor(d.getUTCMonth()/3)+1;
    return `${y}-Q${q}`;
  }
  return `${y}`;
}

export default async function SalesPage() {
  const supabase = await createServerClient();
  const { data: u } = await supabase.auth.getUser();
  const user = u.user ?? null;

  if (!user) {
    return (
      <main className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Sales</h1>
        <p className="mt-4">Sign in required.</p>
        <Link href="/login?redirect=/sales" className="underline">Go to login</Link>
      </main>
    );
  }

  const tenantId = await getEffectiveTenant(supabase);
  if (!tenantId) {
    return (
      <main className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Sales</h1>
        <p className="mt-4">Profile missing tenant.</p>
      </main>
    );
  }

  // 1) Fetch recent orders (last 400 days for safety)
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 400);

  const { data: ordersRaw } = await supabase
    .from("sales_orders")
    .select("id,tenant_id,occurred_at,source,channel")
    .eq("tenant_id", tenantId)
    .gte("occurred_at", since.toISOString())
    .order("occurred_at", { ascending: true });

  const orders: Order[] = (ordersRaw ?? []) as any[];
  const orderIds = orders.map(o => o.id);
  let lines: Line[] = [];
  if (orderIds.length) {
    const { data: linesRaw } = await supabase
      .from("sales_order_lines")
      .select("id,tenant_id,order_id,product_name,qty,unit_price")
      .in("order_id", orderIds);
    lines = (linesRaw ?? []) as any[];
  }

  // 2) Index orders by id for date lookup, compute revenue per line
  const orderById = new Map<string, Order>();
  orders.forEach(o => orderById.set(o.id, o));
  const items = lines.map(l => {
    const o = orderById.get(l.order_id);
    const when = o?.occurred_at ? new Date(o.occurred_at) : null;
    const qty = Number(l.qty ?? 0);
    const price = Number(l.unit_price ?? 0);
    const revenue = qty * price;
    return {
      order_id: l.order_id,
      when,
      product: l.product_name ?? "Item",
      qty,
      price,
      revenue,
    };
  });

  // 3) Aggregate by mode
  function aggregate(mode: "day"|"week"|"month"|"quarter"|"year") {
    const map = new Map<string, { total: number, qty: number, orders: Set<string> }>();
    for (const it of items) {
      if (!it.when) continue;
      const k = periodKey(it.when, mode);
      const cur = map.get(k) ?? { total: 0, qty: 0, orders: new Set() };
      cur.total += it.revenue;
      cur.qty += it.qty;
      cur.orders.add(it.order_id);
      map.set(k, cur);
    }
    // sort by period
    const rows = Array.from(map.entries()).map(([period, v]) => ({
      period,
      orders: v.orders.size,
      qty: v.qty,
      total: v.total,
    })).sort((a,b) => a.period.localeCompare(b.period));
    return rows;
  }

  // default mode is Month; we compute all modes so toggling is instant on the client
  const dayAgg = aggregate("day");
  const weekAgg = aggregate("week");
  const monthAgg = aggregate("month");
  const quarterAgg = aggregate("quarter");
  const yearAgg = aggregate("year");

  // 4) Top products (best & worst by revenue YTD)
  const startOfYear = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
  const ytd = items.filter(it => it.when && it.when >= startOfYear);
  const byProduct = new Map<string, number>();
  for (const it of ytd) {
    byProduct.set(it.product, (byProduct.get(it.product) ?? 0) + it.revenue);
  }
  const ranked = Array.from(byProduct.entries()).sort((a,b) => b[1]-a[1]);
  const top5 = ranked.slice(0, 5);
  const bottom5 = ranked.slice(-5).reverse();

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Sales</h1>
        <div className="flex items-center gap-2">
          <Link href="/sales/upload" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
            Import CSV
          </Link>
          <Link href="/sales/import/template" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
            Download template
          </Link>
        </div>
      </div>

      {/* Period toggles (clientless by rendering all and using details/summary) */}
      <div className="space-y-4">
        {[
          {label:"Month", rows: monthAgg},
          {label:"Week", rows: weekAgg},
          {label:"Day", rows: dayAgg},
          {label:"Quarter", rows: quarterAgg},
          {label:"Year", rows: yearAgg},
        ].map((block, i) => (
          <details key={block.label} open={i===0} className="border rounded-lg">
            <summary className="cursor-pointer px-3 py-2 font-medium bg-neutral-900/60">
              {block.label} totals
            </summary>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-900/40">
                  <tr>
                    <th className="p-2 text-left">{block.label}</th>
                    <th className="p-2 text-right">Orders</th>
                    <th className="p-2 text-right">Qty</th>
                    <th className="p-2 text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map(r => (
                    <tr key={r.period} className="border-t">
                      <td className="p-2">{r.period}</td>
                      <td className="p-2 text-right tabular-nums">{r.orders}</td>
                      <td className="p-2 text-right tabular-nums">{r.qty}</td>
                      <td className="p-2 text-right tabular-nums">{fmtUSD(r.total)}</td>
                    </tr>
                  ))}
                  {block.rows.length === 0 && (
                    <tr><td className="p-3 text-neutral-400" colSpan={4}>No sales yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </details>
        ))}
      </div>

      {/* Top products */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="border rounded-lg overflow-hidden">
          <div className="px-3 py-2 font-medium bg-neutral-900/60">Top 5 products (YTD)</div>
          <table className="w-full text-sm">
            <thead className="bg-neutral-900/40">
              <tr><th className="p-2 text-left">Product</th><th className="p-2 text-right">Revenue</th></tr>
            </thead>
            <tbody>
              {top5.map(([name, total]) => (
                <tr key={name} className="border-t">
                  <td className="p-2">{name}</td>
                  <td className="p-2 text-right tabular-nums">{fmtUSD(total)}</td>
                </tr>
              ))}
              {top5.length === 0 && <tr><td className="p-3 text-neutral-400" colSpan={2}>No data.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="border rounded-lg overflow-hidden">
          <div className="px-3 py-2 font-medium bg-neutral-900/60">Bottom 5 products (YTD)</div>
          <table className="w-full text-sm">
            <thead className="bg-neutral-900/40">
              <tr><th className="p-2 text-left">Product</th><th className="p-2 text-right">Revenue</th></tr>
            </thead>
            <tbody>
              {bottom5.map(([name, total]) => (
                <tr key={name} className="border-t">
                  <td className="p-2">{name}</td>
                  <td className="p-2 text-right tabular-nums">{fmtUSD(total)}</td>
                </tr>
              ))}
              {bottom5.length === 0 && <tr><td className="p-3 text-neutral-400" colSpan={2}>No data.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
