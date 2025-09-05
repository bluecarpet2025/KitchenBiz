import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { fmtUSD } from "@/lib/costing";
import { getEffectiveTenant } from "@/lib/effective-tenant";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

type ReceiptRow = {
  id: string;
  item_id: string;
  qty_base: number | null;
  total_cost_usd: number | null;
  created_at: string | null;
  note: string | null;
  photo_path: string | null;
  expires_on: string | null;
};

type Item = { id: string; name: string | null; base_unit: string | null };

export default async function ReceiptsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  const itemFilter = typeof sp.item === "string" ? sp.item : null;

  const supabase = await createServerClient();
  const { data: au } = await supabase.auth.getUser();
  const user = au.user ?? null;

  if (!user) {
    return (
      <main className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Receipts</h1>
        <p className="mt-4">Sign in required.</p>
        <Link className="underline" href="/login?redirect=/inventory/receipts">
          Go to login
        </Link>
      </main>
    );
  }

  const tenantId = await getEffectiveTenant(supabase);
  if (!tenantId) {
    return (
      <main className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Receipts</h1>
        <p className="mt-4">Profile missing tenant.</p>
      </main>
    );
  }

  // Fetch receipts (optionally filtered by item)
  let q = supabase
    .from("inventory_receipts")
    .select(
      "id,item_id,qty_base,total_cost_usd,created_at,note,photo_path,expires_on",
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (itemFilter) q = q.eq("item_id", itemFilter);

  const { data: receiptsRaw } = await q;
  const receipts = (receiptsRaw ?? []) as ReceiptRow[];

  // Item names
  const ids = Array.from(new Set(receipts.map((r) => r.item_id)));
  const itemMap = new Map<string, Item>();
  if (ids.length) {
    const { data: itemsRaw } = await supabase
      .from("inventory_items")
      .select("id,name,base_unit")
      .in("id", ids);
    (itemsRaw ?? []).forEach((it: any) => itemMap.set(it.id, it));
  }

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Receipts</h1>
        <div className="flex gap-2">
          <Link
            href="/inventory/purchase"
            prefetch={false}
            className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
          >
            New Purchase
          </Link>
          <Link
            href="/inventory/receipts/upload"
            prefetch={false}
            className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
          >
            Import CSV
          </Link>
          <Link
            href="/inventory/receipts/import/template"
            prefetch={false}
            className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
          >
            Download template
          </Link>
        </div>
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
              const it = itemMap.get(r.item_id);
              const label = it?.name ?? r.item_id;
              const purchased =
                r.created_at ? new Date(r.created_at).toLocaleDateString() : "—";
              const photoUrl = r.photo_path
                ? `/api/receipt-photo?path=${encodeURIComponent(r.photo_path)}`
                : null;

              return (
                <tr key={r.id} className="border-t">
                  <td className="p-2">
                    {label}{" "}
                    <Link
                      href={`/inventory/receipts?item=${encodeURIComponent(r.item_id)}`}
                      prefetch={false}
                      className="ml-2 text-xs opacity-60 underline"
                    >
                      only this
                    </Link>
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {Number(r.qty_base ?? 0).toLocaleString()}
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {fmtUSD(Number(r.total_cost_usd ?? 0))}
                  </td>
                  <td className="p-2">{purchased}</td>
                  <td className="p-2">{r.note ?? "—"}</td>
                  <td className="p-2 text-center">
                    {photoUrl ? (
                      <a href={photoUrl} target="_blank" className="underline">
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
