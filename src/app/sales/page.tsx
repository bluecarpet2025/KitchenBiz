import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { getEffectiveTenant } from "@/lib/effective-tenant";
import { fmtUSD } from "@/lib/costing";
import { effectivePlan, canUseFeature } from "@/lib/plan";

export const dynamic = "force-dynamic";
type Tot = { label: string; orders: number; qty: number; revenue: number };

function isoWeek(d: Date) {
  // ISO week number
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((tmp as any) - (yearStart as any)) / 86400000 + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}
function quarterLabel(d: Date) {
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `${d.getFullYear()}-Q${q}`;
}
function agg<T>(lines: any[], keyFn: (d: Date) => string): Tot[] {
  const map = new Map<string, Tot>();
  for (const l of lines ?? []) {
    const occurred = l?.sales_orders?.occurred_at;
    if (!occurred) continue;
    const dt = new Date(occurred);
    const k = keyFn(dt);
    const t = map.get(k) ?? { label: k, orders: 0, qty: 0, revenue: 0 };
    const q = Number(l?.qty ?? 0);
    const p = Number(l?.unit_price ?? 0);
    t.qty += q;
    t.revenue += q * p;
    // approximate order count by counting unique order_id per label
    // to keep it quick we’ll increment by 1 per line; small datasets ok
    t.orders += 1;
    map.set(k, t);
  }
  return Array.from(map.values()).sort((a, b) => (a.label < b.label ? -1 : 1));
}

export default async function SalesPage() {
  const supabase = await createServerClient();
  const tenantId = await getEffectiveTenant(supabase);

  // 🧩 PLAN GATE
  const plan = await effectivePlan();
  const canAccessSales = canUseFeature(plan, "sales_access");
  if (!canAccessSales) {
    return (
      <main className="max-w-3xl mx-auto p-6 text-center">
        <h1 className="text-2xl font-semibold mb-2">Sales</h1>
        <p className="text-neutral-400">Your current plan doesn’t include Sales features.</p>
        <p className="mt-2">
          <Link href="/profile" className="text-blue-400 hover:underline">
            Upgrade your plan →
          </Link>
        </p>
      </main>
    );
  }

  if (!tenantId) {
    return (
      <main className="max-w-7xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Sales</h1>
        <p className="mt-2">Profile missing tenant.</p>
      </main>
    );
  }

  const { data: lines } = await supabase
    .from("sales_order_lines")
    .select("id, order_id, product_name, qty, unit_price, sales_orders!inner(occurred_at)")
    .eq("tenant_id", tenantId)
    .order("id", { ascending: true });

  // Totals
  const byMonth = agg(lines ?? [], (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  const byWeek  = agg(lines ?? [], (d) => isoWeek(d));
  const byDay   = agg(lines ?? [], (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).toLocaleDateString());
  const byQuarter = agg(lines ?? [], (d) => quarterLabel(d));
  const byYear = agg(lines ?? [], (d) => String(d.getFullYear()));

  // YTD top/bottom 5 products
  const now = new Date();
  const yStart = new Date(now.getFullYear(), 0, 1);
  const yEnd = new Date(now.getFullYear() + 1, 0, 1);
  const ytd = (lines ?? []).filter(
    (l: any) => {
      const ts = l?.sales_orders?.occurred_at ? new Date(l.sales_orders.occurred_at).getTime() : NaN;
      return Number.isFinite(ts) && ts >= yStart.getTime() && ts < yEnd.getTime();
    }
  );
  const byProduct = new Map<string, number>();
  for (const l of ytd) {
    const name = String(l?.product_name ?? "").trim() || "(unnamed)";
    const revenue = Number(l?.qty ?? 0) * Number(l?.unit_price ?? 0);
    byProduct.set(name, (byProduct.get(name) ?? 0) + revenue);
  }
  const prodArr = Array.from(byProduct.entries()).map(([name, revenue]) => ({ name, revenue }));
  const top5 = [...prodArr].sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  const bottom5 = [...prodArr].sort((a, b) => a.revenue - b.revenue).slice(0, 5);

  return (
    <main className="max-w-7xl mx-auto p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Sales</h1>
        <div className="flex gap-2">
          <Link href="/sales/manage" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
            Manage
          </Link>
          <Link href="/sales/import" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
            Import CSV
          </Link>
          <Link href="/sales/import/template" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
            Download template
          </Link>
        </div>
      </div>

      {/* Month totals */}
      <details className="border rounded-lg">
        <summary className="cursor-pointer px-3 py-2 bg-neutral-900/50">Month totals</summary>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="p-2 text-left">Month</th>
              <th className="p-2 text-right">Orders</th>
              <th className="p-2 text-right">Qty</th>
              <th className="p-2 text-right">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {byMonth.map((t) => (
              <tr key={t.label} className="border-t">
                <td className="p-2">{t.label}</td>
                <td className="p-2 text-right">{t.orders}</td>
                <td className="p-2 text-right">{t.qty}</td>
                <td className="p-2 text-right">{fmtUSD(t.revenue)}</td>
              </tr>
            ))}
            {byMonth.length === 0 && (
              <tr>
                <td className="p-3 text-neutral-400" colSpan={4}>No data.</td>
              </tr>
            )}
          </tbody>
        </table>
      </details>

      {/* Week totals */}
      <details className="border rounded-lg">
        <summary className="cursor-pointer px-3 py-2 bg-neutral-900/50">Week totals</summary>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="p-2 text-left">Week</th>
              <th className="p-2 text-right">Orders</th>
              <th className="p-2 text-right">Qty</th>
              <th className="p-2 text-right">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {byWeek.map((t) => (
              <tr key={t.label} className="border-t">
                <td className="p-2">{t.label}</td>
                <td className="p-2 text-right">{t.orders}</td>
                <td className="p-2 text-right">{t.qty}</td>
                <td className="p-2 text-right">{fmtUSD(t.revenue)}</td>
              </tr>
            ))}
            {byWeek.length === 0 && (
              <tr>
                <td className="p-3 text-neutral-400" colSpan={4}>No data.</td>
              </tr>
            )}
          </tbody>
        </table>
      </details>

      {/* Day totals */}
      <details className="border rounded-lg">
        <summary className="cursor-pointer px-3 py-2 bg-neutral-900/50">Day totals</summary>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="p-2 text-left">Day</th>
              <th className="p-2 text-right">Orders</th>
              <th className="p-2 text-right">Qty</th>
              <th className="p-2 text-right">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {byDay.map((t) => (
              <tr key={t.label} className="border-t">
                <td className="p-2">{t.label}</td>
                <td className="p-2 text-right">{t.orders}</td>
                <td className="p-2 text-right">{t.qty}</td>
                <td className="p-2 text-right">{fmtUSD(t.revenue)}</td>
              </tr>
            ))}
            {byDay.length === 0 && (
              <tr>
                <td className="p-3 text-neutral-400" colSpan={4}>No data.</td>
              </tr>
            )}
          </tbody>
        </table>
      </details>

      {/* Quarter totals */}
      <details className="border rounded-lg">
        <summary className="cursor-pointer px-3 py-2 bg-neutral-900/50">Quarter totals</summary>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="p-2 text-left">Quarter</th>
              <th className="p-2 text-right">Orders</th>
              <th className="p-2 text-right">Qty</th>
              <th className="p-2 text-right">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {byQuarter.map((t) => (
              <tr key={t.label} className="border-t">
                <td className="p-2">{t.label}</td>
                <td className="p-2 text-right">{t.orders}</td>
                <td className="p-2 text-right">{t.qty}</td>
                <td className="p-2 text-right">{fmtUSD(t.revenue)}</td>
              </tr>
            ))}
            {byQuarter.length === 0 && (
              <tr>
                <td className="p-3 text-neutral-400" colSpan={4}>No data.</td>
              </tr>
            )}
          </tbody>
        </table>
      </details>

      {/* Year totals */}
      <details className="border rounded-lg">
        <summary className="cursor-pointer px-3 py-2 bg-neutral-900/50">Year totals</summary>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="p-2 text-left">Year</th>
              <th className="p-2 text-right">Orders</th>
              <th className="p-2 text-right">Qty</th>
              <th className="p-2 text-right">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {byYear.map((t) => (
              <tr key={t.label} className="border-t">
                <td className="p-2">{t.label}</td>
                <td className="p-2 text-right">{t.orders}</td>
                <td className="p-2 text-right">{t.qty}</td>
                <td className="p-2 text-right">{fmtUSD(t.revenue)}</td>
              </tr>
            ))}
            {byYear.length === 0 && (
              <tr>
                <td className="p-3 text-neutral-400" colSpan={4}>No data.</td>
              </tr>
            )}
          </tbody>
        </table>
      </details>

      {/* Top / Bottom 5 */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="border rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-neutral-900/50 font-medium">Top 5 products (YTD)</div>
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="p-2 text-left">Product</th>
                <th className="p-2 text-right">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {top5.map((r) => (
                <tr key={r.name} className="border-t">
                  <td className="p-2">{r.name}</td>
                  <td className="p-2 text-right">{fmtUSD(r.revenue)}</td>
                </tr>
              ))}
              {top5.length === 0 && (
                <tr>
                  <td className="p-3 text-neutral-400" colSpan={2}>No data.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="border rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-neutral-900/50 font-medium">Bottom 5 products (YTD)</div>
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="p-2 text-left">Product</th>
                <th className="p-2 text-right">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {bottom5.map((r) => (
                <tr key={r.name} className="border-t">
                  <td className="p-2">{r.name}</td>
                  <td className="p-2 text-right">{fmtUSD(r.revenue)}</td>
                </tr>
              ))}
              {bottom5.length === 0 && (
                <tr>
                  <td className="p-3 text-neutral-400" colSpan={2}>No data.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
