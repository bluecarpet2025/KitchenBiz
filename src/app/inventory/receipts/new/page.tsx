import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Rec = {
  id: string;
  item_id: string;
  qty_base: number | null;
  total_cost_usd: number | null;
  purchased_at: string | null;
  photo_path: string | null;
};

export default async function ReceiptsIndex() {
  const supabase = await createServerClient();
  const { data: u } = await supabase.auth.getUser();
  const user = u.user ?? null;

  if (!user) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Receipts</h1>
        <p className="mt-4">Sign in required.</p>
        <Link className="underline" href="/login?redirect=/inventory/receipts">
          Go to login
        </Link>
      </main>
    );
  }

  const { data: prof } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .maybeSingle();
  const tenantId = prof?.tenant_id ?? null;
  if (!tenantId) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Receipts</h1>
        <p className="mt-4">Profile missing tenant.</p>
      </main>
    );
  }

  const { data: rows } = await supabase
    .from("inventory_receipts")
    .select("id,item_id,qty_base,total_cost_usd,purchased_at,photo_path")
    .eq("tenant_id", tenantId)
    .order("purchased_at", { ascending: false })
    .limit(100);

  // Map item names
  const itemIds = Array.from(new Set((rows ?? []).map(r => r.item_id)));
  const { data: items } = await supabase
    .from("inventory_items")
    .select("id,name")
    .in("id", itemIds.length ? itemIds : ["00000000-0000-0000-0000-000000000000"]);
  const nameMap = new Map((items ?? []).map(i => [i.id, i.name as string]));

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Receipts</h1>
        <Link href="/inventory/receipts/new" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
          New Purchase
        </Link>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900/60">
            <tr>
              <th className="p-2 text-left">Date</th>
              <th className="p-2 text-left">Item</th>
              <th className="p-2 text-right">Qty</th>
              <th className="p-2 text-right">Cost (total)</th>
              <th className="p-2 text-left">Photo</th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((r: Rec) => (
              <tr key={r.id} className="border-t">
                <td className="p-2">
                  {r.purchased_at ? new Date(r.purchased_at).toLocaleDateString() : "—"}
                </td>
                <td className="p-2">{nameMap.get(r.item_id) ?? "Item"}</td>
                <td className="p-2 text-right">{r.qty_base ?? 0}</td>
                <td className="p-2 text-right">
                  {typeof r.total_cost_usd === "number"
                    ? r.total_cost_usd.toLocaleString(undefined, {
                        style: "currency",
                        currency: "USD",
                      })
                    : "$0.00"}
                </td>
                <td className="p-2">
                  {r.photo_path ? (
                    <Link
                      href={`/api/receipt-photo?path=${encodeURIComponent(r.photo_path)}`}
                      className="underline"
                      target="_blank"
                    >
                      Photo
                    </Link>
                  ) : (
                    <span className="text-neutral-500">—</span>
                  )}
                </td>
              </tr>
            ))}
            {(!rows || rows.length === 0) && (
              <tr>
                <td className="p-3 text-neutral-400" colSpan={5}>
                  No receipts yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
