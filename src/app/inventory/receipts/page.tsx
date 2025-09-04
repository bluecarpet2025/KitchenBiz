import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { fmtUSD } from "@/lib/costing";
import { getEffectiveTenant } from "@/lib/effective-tenant";

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
type SearchParams = Record<string, string | string[] | undefined>;

export default async function ReceiptsPage({
  searchParams,
}: {
  // Next 15 expects a Promise here
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  const itemFilterRaw = sp.item;
  const itemFilter =
    typeof itemFilterRaw === "string"
      ? itemFilterRaw
      : Array.isArray(itemFilterRaw)
      ? itemFilterRaw[0]
      : undefined;

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

  // Respect demo toggle
  const tenantId = await getEffectiveTenant(supabase);
  if (!tenantId) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Receipts</h1>
        <p className="mt-4">Profile missing tenant.</p>
      </main>
    );
  }

  // Fetch latest receipts (optionally filtered by item)
  let q = supabase
    .from("inventory_receipts")
    .select(
      "id,item_id,qty_base,total_cost_usd,purchased_at,note,photo_path,created_at"
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (itemFilter) q = q.eq("item_id", itemFilter);

  const { data: receiptsRaw, error: receiptsErr } = await q;
  if (receiptsErr) throw receiptsErr;
  const receipts = (receiptsRaw ?? []) as ReceiptRow[];

  // Item names (also include the filter id if no receipts yet)
  const itemIds = Array.from(new Set(receipts.map((r) => r.item_id)));
  if (itemFilter && !itemIds.includes(itemFilter)) itemIds.push(itemFilter);

  const itemName = new Map<string, Item>();
  if (itemIds.length) {
    const { data: itemsRaw } = await supabase
      .from("inventory_items")
      .select("id,name,base_unit")
      .in("id", itemIds);
    (itemsRaw ?? []).forEach((it: any) => itemName.set(it.id, it));
  }
  const filterItem = itemFilter ? itemName.get(itemFilter) : undefined;

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Receipts</h1>
          {itemFilter ? (
            <div className="mt-1 text-sm text-neutral-400">
              Showing receipts for{" "}
              <span className="text-neutral-200">
                {filterItem?.name ?? itemFilter}
              </span>{" "}
              ·{" "}
              <Link href="/inventory/receipts" className="underline">
                Clear filter
              </Link>
            </div>
          ) : null}
        </div>
        <div className="flex gap-3">
          <Link href="/inventory/receipts/new" className="underline">
            New Purchase
          </Link>
          <Link href="/inventory/receipts/import" className="underline">
            Import CSV
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
              const it = itemName.get(r.item_id);
              const proxyUrl = r.photo_path
                ? `/api/receipt-photo?path=${encodeURIComponent(r.photo_path)}`
                : null;

              return (
                <tr key={r.id} className="border-t">
                  <td className="p-2">
                    <div className="flex items-center gap-2">
                      <span>{it?.name ?? r.item_id}</span>
                      {!itemFilter && (
                        <Link
                          href={`/inventory/receipts?item=${encodeURIComponent(
                            r.item_id
                          )}`}
                          className="text-xs underline opacity-70"
                        >
                          only this
                        </Link>
                      )}
                    </div>
                  </td>
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
                    {proxyUrl ? (
                      <a
                        href={proxyUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-block"
                        title="Open photo"
                      >
                        <img
                          src={proxyUrl}
                          alt="Receipt"
                          className="h-16 w-16 object-cover rounded border border-neutral-800 inline-block"
                          loading="lazy"
                        />
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
