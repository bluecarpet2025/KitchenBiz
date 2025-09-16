import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { fmtUSD } from "@/lib/costing";
import { fmtQty } from "@/lib/format";
import { getEffectiveTenant } from "@/lib/effective-tenant";

export const dynamic = "force-dynamic";

type ReceiptDoc = {
  id: string;
  tenant_id: string;
  purchased_at: string | null;
  vendor: string | null;
  note: string | null;
  photo_path: string | null;
  created_at: string | null;
};

type ReceiptLine = {
  id: string;
  item_id: string;
  qty_base: number | null;
  total_cost_usd: number | null;
  expires_on: string | null;
};

type Item = { id: string; name: string | null; base_unit: string | null };

export default async function ReceiptDetailPage(props: any) {
  // Next 15 can hand us a thenable `params` – normalize it.
  const raw = props?.params;
  const params: { id?: string } =
    raw && typeof raw.then === "function" ? await raw : raw ?? {};
  const id = params?.id;

  const supabase = await createServerClient();
  const { data: au } = await supabase.auth.getUser();
  const user = au.user ?? null;

  if (!user) {
    return (
      <main className="max-w-6xl mx-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold">Receipt</h1>
          <Link href="/inventory/receipts" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
            Back to receipts
          </Link>
        </div>
        <div className="border rounded-lg p-4 bg-neutral-950">
          <p className="text-sm text-neutral-400">Sign in required.</p>
        </div>
      </main>
    );
  }

  const tenantId = await getEffectiveTenant(supabase);

  // header/document
  let doc: ReceiptDoc | null = null;
  if (id) {
    const { data: d } = await supabase
      .from("inventory_receipt_docs")
      .select("id,tenant_id,purchased_at,vendor,note,photo_path,created_at")
      .eq("id", id)
      .maybeSingle();
    doc = (d as any) ?? null;
  }

  if (!doc || (tenantId && doc.tenant_id !== tenantId)) {
    return (
      <main className="max-w-6xl mx-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold">Receipt</h1>
          <Link href="/inventory/receipts" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
            Back to receipts
          </Link>
        </div>
        <div className="border rounded-lg p-4 bg-neutral-950">
          <p className="text-sm text-neutral-400">
            Receipt not found or you don’t have access.
          </p>
        </div>
      </main>
    );
  }

  // lines for this document
  const { data: linesRaw } = await supabase
    .from("inventory_receipts")
    .select("id,item_id,qty_base,total_cost_usd,expires_on")
    .eq("receipt_doc_id", doc.id)
    .order("created_at", { ascending: true });

  const lines = (linesRaw ?? []) as ReceiptLine[];

  // fetch item names/units
  const itemIds = Array.from(new Set(lines.map(l => l.item_id)));
  const itemMap = new Map<string, Item>();
  if (itemIds.length) {
    const { data: items } = await supabase
      .from("inventory_items")
      .select("id,name,base_unit")
      .in("id", itemIds);
    (items ?? []).forEach((it: any) => itemMap.set(it.id, it));
  }

  const totals = lines.reduce(
    (acc, r) => {
      acc.qty += Number(r.qty_base ?? 0);
      acc.cost += Number(r.total_cost_usd ?? 0);
      return acc;
    },
    { qty: 0, cost: 0 }
  );

  const photoUrl = doc.photo_path
    ? `/api/receipt-photo?path=${encodeURIComponent(doc.photo_path)}`
    : null;

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Receipt</h1>
          <p className="text-sm text-neutral-400">
            {doc.vendor ? `${doc.vendor} • ` : ""}
            {doc.purchased_at ? new Date(doc.purchased_at).toLocaleDateString() : "—"}
            {doc.note ? ` • ${doc.note}` : ""}
          </p>
        </div>
        <Link href="/inventory/receipts" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
          Back to receipts
        </Link>
      </div>

      {/* photo preview */}
      {photoUrl && (
        <div className="border rounded-lg p-3">
          <div className="text-xs opacity-75 mb-2">Receipt photo</div>
          <a href={photoUrl} target="_blank" className="underline">Open original</a>
        </div>
      )}

      {/* lines */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900/60">
            <tr>
              <th className="p-2 text-left">Item</th>
              <th className="p-2 text-right">Qty (base)</th>
              <th className="p-2 text-left">Unit</th>
              <th className="p-2 text-right">Cost (total)</th>
              <th className="p-2 text-left">Expires</th>
            </tr>
          </thead>
          <tbody>
            {lines.map(l => {
              const it = itemMap.get(l.item_id);
              return (
                <tr key={l.id} className="border-t">
                  <td className="p-2">{it?.name ?? l.item_id}</td>
                  <td className="p-2 text-right tabular-nums">{fmtQty(Number(l.qty_base ?? 0))}</td>
                  <td className="p-2">{it?.base_unit ?? ""}</td>
                  <td className="p-2 text-right tabular-nums">{fmtUSD(Number(l.total_cost_usd ?? 0))}</td>
                  <td className="p-2">
                    {l.expires_on ? new Date(l.expires_on).toLocaleDateString() : "—"}
                  </td>
                </tr>
              );
            })}
            {lines.length === 0 && (
              <tr>
                <td className="p-3 text-neutral-400" colSpan={5}>
                  No lines on this receipt.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot className="bg-neutral-900/40">
            <tr>
              <td className="p-2 font-medium">Totals</td>
              <td className="p-2 text-right font-medium tabular-nums">{fmtQty(totals.qty)}</td>
              <td className="p-2" />
              <td className="p-2 text-right font-medium tabular-nums">{fmtUSD(totals.cost)}</td>
              <td className="p-2" />
            </tr>
          </tfoot>
        </table>
      </div>
    </main>
  );
}
