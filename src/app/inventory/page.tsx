// src/app/inventory/page.tsx
import { createServerClient } from "@/lib/supabase/server";
import AddReceiptButton from "@/components/AddReceiptButton";
import DeleteInventoryItemButton from "@/components/DeleteInventoryItemButton"; 
import { fmtUSD } from "@/lib/costing";

export const dynamic = "force-dynamic";

type DashboardRow = {
  item_id: string;
  tenant_id: string;
  name: string | null;
  base_unit: string | null;
  purchase_unit: string | null;
  pack_to_base_factor: number | null;
  on_hand_base: number | null;
  avg_unit_cost: number | null;
  on_hand_value_usd: number | null;
  expires_soon: string | null;
};

export default async function InventoryLanding() {
  const supabase = await createServerClient();
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  if (!uid) {
    return (
      <main className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Inventory</h1>
        <p className="mt-3">Sign in required.</p>
      </main>
    );
  }

  const { data: prof } = await supabase
    .from("profiles").select("tenant_id").eq("id", uid).maybeSingle();
  const tenantId = prof?.tenant_id ?? null;
  if (!tenantId) {
    return (
      <main className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Inventory</h1>
        <p className="mt-3">No tenant configured for this profile.</p>
      </main>
    );
  }

  // Dashboard joins items + on-hand + avg cost + earliest expiry
  const { data: rowsRaw, error } = await supabase
    .from("v_inventory_dashboard")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("name", { ascending: true });

  if (error) {
    return (
      <main className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Inventory</h1>
        <p className="mt-3 text-red-400">{error.message}</p>
      </main>
    );
  }

  const rows = (rowsRaw ?? []) as DashboardRow[];

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Inventory</h1>
        <div className="text-sm opacity-70">
          Avg cost is calculated from purchases (receipts). Add receipts to update cost and on-hand.
        </div>
      </div>

      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900/60">
            <tr className="text-left">
              <th className="p-2">Name</th>
              <th className="p-2">Base</th>
              <th className="p-2">Purchase</th>
              <th className="p-2">Pack→Base</th>
              <th className="p-2 text-right">On hand (base)</th>
              <th className="p-2 text-right">Avg $ / base</th>
              <th className="p-2 text-right">Value on hand</th>
              <th className="p-2">Expiring soon</th>
              <th className="p-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.item_id} className="border-t">
                <td className="p-2">{r.name ?? "—"}</td>
                <td className="p-2">{r.base_unit ?? "—"}</td>
                <td className="p-2">{r.purchase_unit ?? "—"}</td>
                <td className="p-2 tabular-nums">
                  {Number(r.pack_to_base_factor ?? 0).toLocaleString()}
                </td>
                <td className="p-2 text-right tabular-nums">
                  {Number(r.on_hand_base ?? 0).toFixed(3)}
                </td>
                <td className="p-2 text-right tabular-nums">
                  {fmtUSD(Number(r.avg_unit_cost ?? 0))}
                </td>
                <td className="p-2 text-right tabular-nums">
                  {fmtUSD(Number(r.on_hand_value_usd ?? 0))}
                </td>
                <td className="p-2">
                  {r.expires_soon ? new Date(r.expires_soon).toLocaleDateString() : "—"}
                </td>
                <td className="p-2 text-right">
                  <div className="inline-flex gap-2">
                    <AddReceiptButton
                      itemId={r.item_id}
                      itemName={r.name ?? "Item"}
                      baseUnit={r.base_unit ?? ""}
                    />
                    <DeleteInventoryItemButton id={r.item_id} />
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="p-4 text-neutral-400">
                  No items yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
