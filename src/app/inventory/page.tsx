// src/app/inventory/page.tsx
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { fmtUSD } from "@/lib/costing";
import { fmtQty } from "@/lib/format";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  name: string;
  base_unit: string | null;
  purchase_unit: string | null;
  pack_to_base_factor: number | null;
  on_hand_base: number | null;       // quantity to format
  avg_unit_cost: number | null;      // $/base
  on_hand_value_usd: number | null;  // value on hand
  expires_soon: string | null;       // ISO date string (nearest)
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

  const { data: prof } = await supabase
    .from("profiles").select("tenant_id").eq("id", user.id).maybeSingle();

  const tenantId = prof?.tenant_id ?? null;
  if (!tenantId) {
    return (
      <main className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Inventory</h1>
        <p className="mt-4">Profile missing tenant.</p>
      </main>
    );
  }

  // Pull the rows used by the dashboard table (whatever view/table you already use)
  // This matches the columns we show. If your source is different, keep the SELECT
  // you already have — just ensure these field names line up with Row.
  const { data: rowsRaw } = await supabase
    .from("v_inventory_dashboard") // <- use your existing source
    .select(
      "id,name,base_unit,purchase_unit,pack_to_base_factor,on_hand_base,avg_unit_cost,on_hand_value_usd,expires_soon"
    )
    .eq("tenant_id", tenantId)
    .order("name");

  const rows = (rowsRaw ?? []) as Row[];

  // Header KPIs
  const itemsCount = rows.length;
  const totalValue = rows.reduce((s, r) => s + Number(r.on_hand_value_usd || 0), 0);
  const nearestExpiry = rows
    .map(r => r.expires_soon ? new Date(r.expires_soon) : null)
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

      {/* KPIs */}
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
          <div className="text-xl font-semibold">
            {nearestExpiry ? nearestExpiry.toLocaleDateString() : "—"}
          </div>
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
                <td className="p-2 text-right tabular-nums">
                  {fmtQty(r.on_hand_base)}
                </td>
                <td className="p-2 text-right tabular-nums">
                  {fmtUSD(Number(r.avg_unit_cost || 0))}
                </td>
                <td className="p-2 text-right tabular-nums">
                  {fmtUSD(Number(r.on_hand_value_usd || 0))}
                </td>
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
