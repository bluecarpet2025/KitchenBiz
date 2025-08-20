import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import ArchiveItemButton from "@/components/ArchiveItemButton";

export const dynamic = "force-dynamic";

type Item = { id: string; name: string | null; base_unit: string | null };

export default async function ManageInventoryPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Manage Inventory</h1>
        <p className="mt-4">Sign in required.</p>
        <Link href="/login?redirect=/inventory/manage" className="underline">Go to login</Link>
      </main>
    );
  }
  const { data: profile } = await supabase
    .from("profiles").select("tenant_id").eq("id", user.id).single();
  const tenantId = profile?.tenant_id ?? null;

  const { data: items } = await supabase
    .from("inventory_items")
    .select("id,name,base_unit,deleted_at")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .order("name");

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Manage Inventory</h1>
        <Link href="/inventory" className="underline text-sm">← Inventory</Link>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900/60">
            <tr>
              <th className="text-left p-2">Item</th>
              <th className="text-left p-2">Base Unit</th>
              <th className="text-left p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(items ?? []).map((it: Item) => (
              <tr key={it.id} className="border-t">
                <td className="p-2">{it.name}</td>
                <td className="p-2">{it.base_unit ?? ""}</td>
                <td className="p-2">
                  <ArchiveItemButton itemId={it.id} onArchived={() => location.reload()} />
                </td>
              </tr>
            ))}
            {(!items || items.length === 0) && (
              <tr><td colSpan={3} className="p-3 text-neutral-400">No items.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
