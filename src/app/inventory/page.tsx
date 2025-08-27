// src/app/inventory/page.tsx
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import AddReceiptButton from "@/components/AddReceiptButton";
import DeleteInventoryItemButton from "@/components/DeleteInventoryItemButton";
import { fmtUSD } from "@/lib/costing";

export const dynamic = "force-dynamic";

type Item = {
  id: string;
  tenant_id: string;
  name: string;
  base_unit: string | null;
  purchase_unit: string | null;
  pack_to_base_factor: number | null;
};

type OnHandRow = { item_id: string; qty_on_hand_base: number };
type Receipt = {
  item_id: string;
  qty_base: number | null;
  total_cost_usd: number | null;
  expires_on: string | null;
};

export default async function InventoryLanding() {
  const supabase = await createServerClient();
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  if (!uid) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Inventory</h1>
        <p className="mt-3">Sign in required.</p>
        <Link className="underline" href="/login?redirect=/inventory">Go to login</Link>
      </main>
    );
  }

  const { data: prof } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", uid)
    .maybeSingle();

  const tenantId = prof?.tenant_id ?? null;
  if (!tenantId) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Inventory</h1>
        <p className="mt-3">No tenant configured for this profile.</p>
      </main>
    );
  }

  // Base items (hide soft-deleted)
  const { data: itemsRaw } = await supabase
    .from("inventory_items")
    .select("id,tenant_id,name,base_unit,purchase_unit,pack_to_base_factor,deleted_at")
    .eq("tenant_id", tenantId)
    .order("name");

  const items = (itemsRaw ?? []).filter((r: any) => !r.deleted_at) as Item[];

  // On-hand quantities (base units)
  const { data: onhandRows } = await supabase
    .from("v_inventory_on_hand")
    .select("item_id,qty_on_hand_base")
    .eq("tenant_id", tenantId);

  // Receipts for avg-cost + expirations
  const { data: receipts } = await supabase
    .from("inventory_receipts")
    .select("item_id,qty_base,total_cost_usd,expires_on")
    .eq("tenant_id", tenantId);

  const onHandById = new Map<string, number>();
  (onhandRows ?? []).forEach((r: OnHandRow) => {
    onHandById.set(r.item_id, Number(r.qty_on_hand_base ?? 0));
  });

  // Aggregate receipts -> avg $/base and earliest expiry
  const costAgg = new Map<string, { qty: number; cost: number }>();
  const nextExpiryById = new Map<string, string>();
  (receipts ?? []).forEach((r: Receipt) => {
    const id = r.item_id;
    const qty = Number(r.qty_base ?? 0);
    const cost = Number(r.total_cost_usd ?? 0);
    if (qty > 0) {
      const cur = costAgg.get(id) ?? { qty: 0, cost: 0 };
      cur.qty += qty;
      cur.cost += cost;
      costAgg.set(id, cur);
    }
    if (r.expires_on) {
      const prev = nextExpiryById.get(id);
      if (!prev || new Date(r.expires_on) < new Date(prev)) {
        nextExpiryById.set(id, r.expires_on);
      }
    }
  });

  // Build rows + page KPIs
  let totalOnHandValue = 0;
  let nearestExpiry: string | null = null;

  const rows = items.map((it) => {
    const onHand = Number(onHandById.get(it.id) ?? 0);
    const agg = costAgg.get(it.id);
    const avgPerBase = agg && agg.qty > 0 ? agg.cost / agg.qty : 0;

    const value = onHand * avgPerBase;
    totalOnHandValue += value;

    const expires = nextExpiryById.get(it.id) ?? null;
    if (expires) {
      if (!nearestExpiry || new Date(expires) < new Date(nearestExpiry)) {
        nearestExpiry = expires;
      }
    }

    return {
      id: it.id,
      name: it.name,
      base_unit: it.base_unit ?? "—",
      purchase_unit: it.purchase_unit ?? "—",
      pack_to_base: Number(it.pack_to_base_factor ?? 0),
      on_hand: onHand,
      avg_per_base: avgPerBase,
      value_on_hand: value,
      expires_on: expires,
    };
  });

  // Simple helpers
  const fmtInt = (n: number) =>
    new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.floor(n || 0));
  const fmtQty = (n: number) =>
    new Intl.NumberFormat("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(
      Number(n || 0)
    );

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Inventory</h1>
        {/* Quick links – restored */}
        <div className="flex gap-2">
          <Link href="/inventory/counts/new" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
            New count
          </Link>
          <Link href="/inventory/counts" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
            Counts
          </Link>
          <Link href="/inventory/manage" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
            Manage items
          </Link>
          <Link href="/inventory/purchase" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
            Purchase
          </Link>
          <Link href="/inventory/help" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
            Help
          </Link>
        </div>
      </div>

      {/* KPI bar – restored */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="border rounded p-3">
          <div className="text-xs uppercase opacity-70">Items</div>
          <div className="text-xl font-semibold tabular-nums">{items.length}</div>
        </div>
        <div className="border rounded p-3">
          <div className="text-xs uppercase opacity-70">On-hand value</div>
          <div className="text-xl font-semibold tabular-nums">{fmtUSD(totalOnHandValue)}</div>
        </div>
        <div className="border rounded p-3">
          <div className="text-xs uppercase opacity-70">Nearest expiry</div>
          <div className="text-xl font-semibold tabular-nums">
            {nearestExpiry ? new Date(nearestExpiry).toLocaleDateString() : "—"}
          </div>
        </div>
      </div>

      <p className="text-xs opacity-70">
        Avg cost is calculated from purchases (receipts). Add receipts to update avg cost and on-hand. The “Pack→Base”
        number is formatted with commas but stored as an integer.
      </p>

      {/* Inventory table (new + restored actions) */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900/60">
            <tr>
              <th className="text-left p-2">Name</th>
              <th className="text-left p-2">Base</th>
              <th className="text-left p-2">Purchase</th>
              <th className="text-right p-2">Pack→Base</th>
              <th className="text-right p-2">On hand (base)</th>
              <th className="text-right p-2">Avg $ / base</th>
              <th className="text-right p-2">Value on hand</th>
              <th className="text-left p-2">Expiring soon</th>
              <th className="text-left p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-2">{r.name}</td>
                <td className="p-2">{r.base_unit}</td>
                <td className="p-2">{r.purchase_unit}</td>
                <td className="p-2 text-right tabular-nums">{fmtInt(r.pack_to_base)}</td>
                <td className="p-2 text-right tabular-nums">{fmtQty(r.on_hand)}</td>
                <td className="p-2 text-right tabular-nums">{fmtUSD(r.avg_per_base)}</td>
                <td className="p-2 text-right tabular-nums">{fmtUSD(r.value_on_hand)}</td>
                <td className="p-2">
                  {r.expires_on ? new Date(r.expires_on).toLocaleDateString() : "—"}
                </td>
                <td className="p-2">
                  <div className="flex items-center gap-3">
                    <AddReceiptButton
                      itemId={r.id}
                      itemName={r.name}
                      baseUnit={r.base_unit || ""}
                    />
                    <DeleteInventoryItemButton id={r.id} />
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="p-3 text-neutral-400">No items yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
