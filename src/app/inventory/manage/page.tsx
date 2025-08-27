// Server component
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
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
};

async function getTenant() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, tenantId: null };
  const { data: prof } = await supabase
    .from("profiles").select("tenant_id").eq("id", user.id).maybeSingle();
  return { supabase, user, tenantId: prof?.tenant_id ?? null };
}

export default async function ManageInventoryPage() {
  const { supabase, user, tenantId } = await getTenant();

  if (!user || !tenantId) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Manage inventory</h1>
        <p className="mt-4">Sign in required, or tenant not configured.</p>
        <Link className="underline" href="/inventory">Back to Inventory</Link>
      </main>
    );
  }

  const { data: items } = await supabase
    .from("inventory_items")
    .select("id,tenant_id,name,base_unit,purchase_unit,pack_to_base_factor,sku,par_level")
    .eq("tenant_id", tenantId)
    .order("name");

  const rows: Item[] = (items ?? []) as Item[];

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Manage items</h1>
        <div className="flex gap-2">
          <Link href="/inventory" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
            Back to Inventory
          </Link>
          <Link href="/inventory/items/new" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
            New item
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
            {rows.map(r => (
              <tr key={r.id} className="border-t">
                <td className="p-2">{r.name}</td>
                <td className="p-2">{r.base_unit ?? "—"}</td>
                <td className="p-2">{r.purchase_unit ?? "—"}</td>
                <td className="p-2 text-right tabular-nums">
                  {r.pack_to_base_factor == null ? "—" : r.pack_to_base_factor.toLocaleString()}
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
                    <DeleteInventoryItemButton id={r.id} />
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td className="p-3 text-neutral-400" colSpan={7}>No items yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
