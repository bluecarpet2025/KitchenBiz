import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { effectiveTenantId } from "@/lib/effective-tenant";
import DeleteInventoryItemButton from "@/components/DeleteInventoryItemButton";

export const dynamic = "force-dynamic";

type Item = {
  id: string;
  tenant_id: string;
  name: string;
  base_unit: string | null;
  purchase_unit: string | null;
  pack_to_base_factor: number | null;
  sku: string | null;
  par_level: number | null;
  deleted_at?: string | null;
};

export default async function ManageInventoryPage() {
  const supabase = await createServerClient();
  const { tenantId, useDemo } = await effectiveTenantId();

  if (!tenantId) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Manage items</h1>
        <p className="mt-4">Sign in required, or tenant not configured.</p>
        <Link className="underline" href="/login?redirect=/inventory/manage">
          Go to login
        </Link>
      </main>
    );
  }

  // 🔹 Fetch inventory items
  const { data: itemsRaw, error } = await supabase
    .from("inventory_items")
    .select(
      "id, tenant_id, name, base_unit, purchase_unit, pack_to_base_factor, sku, par_level, deleted_at"
    )
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .order("name");

  if (error) console.error("Inventory fetch error:", error);

  const rows = (itemsRaw ?? []) as Item[];

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          Manage items {useDemo && <span className="text-sm text-green-400">(Demo)</span>}
        </h1>
        <div className="flex gap-2">
          <Link
            href="/inventory/items/new"
            className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
          >
            New item
          </Link>
          <Link
            href="/api/seed-default-ingredients"
            className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
          >
            Seed Defaults
          </Link>
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900/60">
            <tr>
              <th className="text-left p-2">Name</th>
              <th className="text-left p-2">Base</th>
              <th className="text-left p-2">Purchase</th>
              <th className="text-right p-2">Pack→Base</th>
              <th className="text-left p-2">SKU</th>
              <th className="text-right p-2">Par</th>
              <th className="text-right p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="p-3 text-neutral-400 text-center" colSpan={7}>
                  No items yet.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-2">{r.name}</td>
                  <td className="p-2">{r.base_unit ?? "—"}</td>
                  <td className="p-2">{r.purchase_unit ?? "—"}</td>
                  <td className="p-2 text-right tabular-nums">
                    {r.pack_to_base_factor == null
                      ? "—"
                      : r.pack_to_base_factor.toLocaleString()}
                  </td>
                  <td className="p-2">{r.sku ?? "—"}</td>
                  <td className="p-2 text-right">{r.par_level ?? 0}</td>
                  <td className="p-2 text-right">
                    <div className="inline-flex gap-2">
                      <Link
                        href={`/inventory/items/${r.id}/edit`}
                        className="text-xs underline"
                      >
                        Edit
                      </Link>
                      <DeleteInventoryItemButton itemId={r.id} />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
