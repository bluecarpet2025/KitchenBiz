import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { fmtUSD } from "@/lib/costing";

export const dynamic = "force-dynamic";

type ReceiptRow = {
  id: string;
  item_id: string;
  qty_base: number | null;
  total_cost_usd: number | null;
  purchased_at: string | null;
  note: string | null;
  photo_path: string | null;
  created_at: string | null;
};

type Item = { id: string; name: string | null; base_unit: string | null };

export default async function ReceiptsPage() {
  const supabase = await createServerClient();
  const { data: au } = await supabase.auth.getUser();
  const user = au.user ?? null;

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

  // fetch latest receipts for the tenant
  const { data: receiptsRaw } = await supabase
    .from("inventory_receipts")
    .select(
      "id,item_id,qty_base,total_cost_usd,purchased_at,note,photo_path,created_at"
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(100);

  const receipts = (receiptsRaw ?? []) as ReceiptRow[];

  // fetch item names (small helper map)
  const ids = Array.from(new Set(receipts.map((r) => r.item_id)));
  let itemName = new Map<string, Item>();
  if (ids.length) {
    const { data: itemsRaw } = await supabase
      .from("inventory_items")
      .select("id,name,base_unit")
      .in("id", ids);
    (itemsRaw ?? []).forEach((it: any) => itemName.set(it.id, it));
  }

  // signed URLs for photos
  async function signedUrl(path: string) {
    const { data, error } = await supabase.storage
      .from("receipts")
      .createSignedUrl(path, 60 * 10); // 10 minutes
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  }

  // generate in parallel
  const photoMap = new Map<string, string | null>();
  await Promise.all(
    receipts.map(async (r) => {
      if (r.photo_path) {
        photoMap.set(r.id, await signedUrl(r.photo_path));
      } else {
        photoMap.set(r.id, null);
      }
    })
  );

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Receipts</h1>
        <Link href="/inventory/receipts/new" className="underline">
          New Purchase
        </Link>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900/60">
            <tr>
              <th className="p-2 text-left">Item</th>
              <th className="p-2 text-right">Qty (base)</th>
              <th className="p-2 text-right">Cost</th>
              <th className="p-2">Purchased</th>
              <th className="p-2">Note</th>
              <th className="p-2 text-center">Photo</th>
            </tr>
          </thead>
          <tbody>
            {receipts.map((r) => {
              const it = itemName.get(r.item_id);
              const url = photoMap.get(r.id) ?? null;
              return (
                <tr key={r.id} className="border-t">
                  <td className="p-2">{it?.name ?? r.item_id}</td>
                  <td className="p-2 text-right tabular-nums">
                    {Number(r.qty_base ?? 0).toLocaleString()}
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {fmtUSD(Number(r.total_cost_usd ?? 0))}
                  </td>
                  <td className="p-2">
                    {r.purchased_at
                      ? new Date(r.purchased_at).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="p-2">{r.note ?? "—"}</td>
                  <td className="p-2 text-center">
                    {url ? (
                      <a href={url} target="_blank" className="underline">
                        View
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
            {receipts.length === 0 && (
              <tr>
                <td className="p-3 text-neutral-400" colSpan={6}>
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
