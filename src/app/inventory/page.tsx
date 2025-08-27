// src/app/inventory/page.tsx
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import DeleteInventoryItemButton from "@/components/DeleteInventoryItemButton";
import { fmtUSD } from "@/lib/costing";

export const dynamic = "force-dynamic";

type Item = {
  id: string;
  name: string;
  base_unit: string;
  purchase_unit: string;
  pack_to_base_factor: number | null;
};

type SumRow = {
  item_id: string;
  on_hand_base: number;
  avg_cost_per_base: number;
  value_on_hand_usd: number;
  nearest_expiry: string | null;
};

const fmtQty = (n: number) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(n);

const fmtInt = (n: number | null) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Number(n ?? 0));

async function getTenant() {
  const supabase = await createServerClient();
  const { data: u } = await supabase.auth.getUser();
  const user = u.user ?? null;
  if (!user) return { supabase, user: null, tenantId: null };
  const { data: prof } = await supabase.from("profiles")
    .select("tenant_id").eq("id", user.id).maybeSingle();
  return { supabase, user, tenantId: prof?.tenant_id ?? null };
}

export default async function InventoryLanding() {
  const { supabase, user, tenantId } = await getTenant();

  if (!user || !tenantId) {
    return (
      <main className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Inventory</h1>
        <p className="mt-4">Sign in required.</p>
        <Link className="underline" href="/login?redirect=/inventory">Go to login</Link>
      </main>
    );
  }

  // Base items
  const { data: itemsData, error: itemsErr } = await supabase
    .from("inventory_items")
    .select("id,name,base_unit,purchase_unit,pack_to_base_factor")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .order("name", { ascending: true });

  if (itemsErr) throw itemsErr;

  const items = (itemsData ?? []) as Item[];

  // On-hand summaries
  const { data: sumsData, error: sumsErr } = await supabase
    .from("v_item_onhand_summary")
    .select("item_id,on_hand_base,avg_cost_per_base,value_on_hand_usd,nearest_expiry")
    .eq("tenant_id", tenantId);

  if (sumsErr) throw sumsErr;

  const sumsMap = new Map<string, SumRow>();
  for (const r of (sumsData ?? []) as SumRow[]) sumsMap.set(r.item_id, r);

  // merge
  const rows = items.map(i => {
    const s = sumsMap.get(i.id);
    return {
      ...i,
      on_hand_base: Number(s?.on_hand_base ?? 0),
      avg_cost_per_base: Number(s?.avg_cost_per_base ?? 0),
      value_on_hand_usd: Number(s?.value_on_hand_usd ?? 0),
      nearest_expiry: s?.nearest_expiry ?? null,
    };
  });

  // header metrics
  const itemsCount = rows.length;
  const totalValue = rows.reduce((acc, r) => acc + (r.value_on_hand_usd || 0), 0);
  const nearest = rows
    .map(r => r.nearest_expiry)
    .filter(Boolean) as string[];
  const nearestExpiry = nearest.length ? nearest.sort()[0] : null;

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Inventory</h1>
        <div className="flex gap-2">
          <Link href="/inventory/counts/new" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
            New count
          </Link>
          <Link href="/inventory/counts" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
            Counts history
          </Link>
          <Link href="/inventory/manage" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
            Manage items
          </Link>
          <Link href="/inventory/purchase" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
            Purchase
          </Link>
          <Link href="/help/inventory" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
            Help
          </Link>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <div className="border rounded p-3">
          <div className="text-xs uppercase opacity-70">Items</div>
          <div className="text-xl font-semibold">{fmtInt(itemsCount)}</div>
        </div>
        <div className="border rounded p-3">
          <div className="text-xs uppercase opacity-70">On-hand value</div>
          <div className="text-xl font-semibold">{fmtUSD(totalValue)}</div>
        </div>
        <div className="border rounded p-3">
          <div className="text-xs uppercase opacity-70">Nearest expiry</div>
          <div className="text-xl font-semibold">
            {nearestExpiry ? new Date(nearestExpiry).toLocaleDateString() : "—"}
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
            {rows.map(r => (
              <tr key={r.id} className="border-t">
                <td className="p-2">{r.name}</td>
                <td className="p-2">{r.base_unit}</td>
                <td className="p-2">{r.purchase_unit}</td>
                <td className="p-2 text-right">{fmtInt(r.pack_to_base_factor)}</td>
                <td className="p-2 text-right tabular-nums">{fmtQty(r.on_hand_base)}</td>
                <td className="p-2 text-right tabular-nums">{fmtUSD(r.avg_cost_per_base)}</td>
                <td className="p-2 text-right tabular-nums">{fmtUSD(r.value_on_hand_usd)}</td>
                <td className="p-2">
                  {r.nearest_expiry ? new Date(r.nearest_expiry).toLocaleDateString() : "—"}
                </td>
                <td className="p-2 flex gap-2">
                  <Link
                    href={`/inventory/purchase?itemId=${r.id}`}
                    className="px-2 py-1 border rounded text-xs hover:bg-neutral-900">
                    Add receipt
                  </Link>
                  <DeleteInventoryItemButton id={r.id} />
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
