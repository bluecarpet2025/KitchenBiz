// src/app/inventory/page.tsx
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { fmtUSD } from "@/lib/costing";
import { fmtQty } from "@/lib/format";
import { getEffectiveTenant } from "@/lib/effective-tenant";

export const dynamic = "force-dynamic";

type Item = {
  id: string;
  name: string;
  base_unit: string | null;
  purchase_unit: string | null;
  pack_to_base_factor: number | null;
};
type Onhand = { item_id: string; qty_on_hand_base: number | null };
type ReceiptRow = {
  item_id: string;
  total_cost_usd: number | null;
  qty_base: number | null;
  expires_on: string | null;
};

export default async function InventoryLanding() {
  const supabase = await createServerClient();
  const { data: u } = await supabase.auth.getUser();
  const user = u.user ?? null;

  if (!user) {
    return (
      <main className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Inventory</h1>
        <p className="mt-4">Sign in required.</p>
        <Link href="/login?redirect=/inventory" className="underline">Go to login</Link>
      </main>
    );
  }

  // ✅ Use demo tenant when opted-in, otherwise the user’s own tenant
  const tenantId = await getEffectiveTenant(supabase);
  if (!tenantId) {
    return (
      <main className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Inventory</h1>
        <p className="mt-4">Profile missing tenant.</p>
      </main>
    );
  }

  // 1) Items
  const { data: itemsRaw, error: itemsErr } = await supabase
    .from("inventory_items")
    .select("id,name,base_unit,purchase_unit,pack_to_base_factor")
    .eq("tenant_id", tenantId)
    .order("name");
  if (itemsErr) throw itemsErr;
  const items = (itemsRaw ?? []) as Item[];

  // 2) On-hand (from view)
  const { data: onhandsRaw } = await supabase
    .from("v_inventory_on_hand")
    .select("item_id, qty_on_hand_base")
    .eq("tenant_id", tenantId);
  const onhands = (onhandsRaw ?? []) as Onhand[];
  const onhandMap = new Map(onhands.map(o => [o.item_id, Number(o.qty_on_hand_base || 0)]));

  // 3) Receipts (for avg $/base & earliest expiry)
  const { data: rcptsRaw } = await supabase
    .from("inventory_receipts")
    .select("item_id,total_cost_usd,qty_base,expires_on")
    .eq("tenant_id", tenantId);
  const rcpts = (rcptsRaw ?? []) as ReceiptRow[];

  const totals = new Map<string, { cost: number; qty: number }>();
  const expMap = new Map<string, string | null>();
  for (const r of rcpts) {
    const id = r.item_id;
    const cost = Number(r.total_cost_usd || 0);
    const qty = Number(r.qty_base || 0);
    const prev = totals.get(id) ?? { cost: 0, qty: 0 };
    prev.cost += cost;
    prev.qty += qty;
    totals.set(id, prev);
    if (r.expires_on) {
      const prevDate = expMap.get(id);
      if (!prevDate || new Date(r.expires_on) < new Date(prevDate)) {
        expMap.set(id, r.expires_on);
      }
    } else if (!expMap.has(id)) {
      expMap.set(id, null);
    }
  }

  const avgMap = new Map<string, number>();
  totals.forEach((v, id) => {
    const avg = v.qty > 0 ? v.cost / v.qty : 0;
    avgMap.set(id, avg);
  });

  const rows = items.map(i => {
    const on = onhandMap.get(i.id) ?? 0;
    const avg = avgMap.get(i.id) ?? 0;
    const value = on * avg;
    const expiresSoon = expMap.get(i.id) ?? null;
    return {
      ...i,
      on_hand_base: on,
      avg_unit_cost: avg,
      on_hand_value_usd: value,
      expires_soon: expiresSoon,
    };
  });

  const itemsCount = rows.length;
  const totalValue = rows.reduce((s, r) => s + Number(r.on_hand_value_usd || 0), 0);
  const nearestExpiry = rows
    .map(r => (r.expires_soon ? new Date(r.expires_soon) : null))
    .filter((d): d is Date => !!d)
    .sort((a, b) => a.getTime() - b.getTime())[0];

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Inventory</h1>
        <div className="flex gap-2">
          <Link href="/inventory/counts/new" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">New count</Link>
          <Link href="/inventory/counts" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">Counts history</Link>
          <Link href="/inventory/manage" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">Manage items</Link>
          <Link href="/inventory/purchase" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">Purchase</Link>
          <Link href="/help/inventory" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">Help</Link>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="border rounded p-3">
          <div className="text-xs uppercase opacity-70">Items</div>
          <div className="text-xl font-semibold tabular-nums">{itemsCount.toLocaleString()}</div>
        </div>
        <div className="border rounded p-3">
          <div className="text-xs uppercase opacity-70">On-hand value</div>
          <div className="text-xl font-semibold tabular-nums">{fmtUSD(totalValue)}</div>
        </div>
        <div className="border rounded p-3">
          <div className="text-xs uppercase opacity-70">Nearest expiry</div>
          <div className="text-xl font-semibold">{nearestExpiry ? nearestExpiry.toLocaleDateString() : "—"}</div>
        </div>
      </div>

      <p className="text-xs opacity-70">
        Avg cost is calculated from purchases (receipts). Add receipts to update avg cost and on-hand.
        The “Pack→Base” number is formatted with commas and stored as an integer.
      </p>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900/60">
            <tr>
              <th className="p-2 text-left">Name</th>
              <th className="p-2 text-left">Base</th>
              <th className="p-2 text-left">Purchase</th>
              <th className="p-2 text-right">Pack→Base</th>
              <th className="p-2 text-right">On hand (base)</th>
              <th className="p-2 text-right">Avg $ / base</th>
              <th className="p-2 text-right">Value on hand</th>
              <th className="p-2 text-right">Expiring soon</th>
              <th className="p-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-t">
                <td className="p-2">{r.name}</td>
                <td className="p-2">{r.base_unit ?? "—"}</td>
                <td className="p-2">{r.purchase_unit ?? "—"}</td>
                <td className="p-2 text-right tabular-nums">
                  {r.pack_to_base_factor != null
                    ? Number(r.pack_to_base_factor).toLocaleString()
                    : "—"}
                </td>
                <td className="p-2 text-right tabular-nums">{fmtQty(r.on_hand_base)}</td>
                <td className="p-2 text-right tabular-nums">{fmtUSD(Number(r.avg_unit_cost || 0))}</td>
                <td className="p-2 text-right tabular-nums">{fmtUSD(Number(r.on_hand_value_usd || 0))}</td>
                <td className="p-2 text-right">
                  {r.expires_soon ? new Date(r.expires_soon).toLocaleDateString() : "—"}
                </td>
                <td className="p-2 text-right">
                  <div className="flex gap-1 justify-end">
                    <Link href={`/inventory/receipts/new?item=${encodeURIComponent(r.id)}`} className="px-2 py-1 border rounded text-xs hover:bg-neutral-900">
                      Add receipt
                    </Link>
                    <Link href={`/inventory/items/${r.id}/delete`} className="px-2 py-1 border rounded text-xs hover:bg-neutral-900 text-red-300">
                      Delete
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="p-3 text-neutral-400" colSpan={9}>No items yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
