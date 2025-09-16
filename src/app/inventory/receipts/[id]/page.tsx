import Link from 'next/link';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function ReceiptDetail({ params }: { params: { id: string } }) {
  const supabase = await createServerClient();

  const { data: doc } = await supabase
    .from('inventory_receipt_docs')
    .select('*')
    .eq('id', params.id)
    .maybeSingle();

  // Lines: either doc-linked or legacy “single-line receipt” with r.id = params.id
  const { data: linesDoc } = await supabase
    .from('inventory_receipts')
    .select('id,item_id,qty_base,total_cost_usd,note,created_at,purchased_at,photo_path')
    .eq('receipt_doc_id', params.id)
    .order('created_at');

  let lines = linesDoc ?? [];
  if (!doc) {
    const { data: legacy } = await supabase
      .from('inventory_receipts')
      .select('id,item_id,qty_base,total_cost_usd,note,created_at,purchased_at,photo_path')
      .eq('id', params.id)
      .limit(1);
    lines = legacy ?? [];
  }

  const itemIds = Array.from(new Set(lines.map(l => l.item_id)));
  const { data: items } = await supabase
    .from('inventory_items')
    .select('id,name,base_unit')
    .in('id', itemIds.length ? itemIds : ['00000000-0000-0000-0000-000000000000']);
  const nameMap = new Map((items ?? []).map(i => [i.id, i.name as string]));

  const total = (lines ?? []).reduce((s, l:any) => s + Number(l.total_cost_usd ?? 0), 0);
  const purchasedAt = doc?.purchased_at ?? lines[0]?.purchased_at ?? lines[0]?.created_at ?? null;

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Receipt</h1>
          <div className="text-sm opacity-80">
            {purchasedAt ? new Date(purchasedAt).toLocaleString() : '—'}
            {doc?.vendor ? ` • ${doc.vendor}` : ''}
          </div>
          {(doc?.note) && <div className="text-sm opacity-80">{doc.note}</div>}
        </div>
        <Link href="/inventory/receipts" className="px-3 py-2 border rounded text-sm hover:bg-neutral-900">Back</Link>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <div className="border rounded p-3">
          <div className="text-xs opacity-75">LINES</div>
          <div className="text-xl font-semibold">{(lines ?? []).length}</div>
        </div>
        <div className="border rounded p-3">
          <div className="text-xs opacity-75">TOTAL</div>
          <div className="text-xl font-semibold">${total.toFixed(2)}</div>
        </div>
        <div className="border rounded p-3">
          <div className="text-xs opacity-75">PHOTO</div>
          <div className="mt-2">
            {doc?.photo_url ? <a className="underline" href={doc.photo_url}>Open</a> : '—'}
          </div>
        </div>
      </div>

      <div className="border rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900/60">
            <tr>
              <th className="p-2 text-left">Item</th>
              <th className="p-2 text-right">Qty (base)</th>
              <th className="p-2 text-right">Total $</th>
            </tr>
          </thead>
          <tbody>
            {(lines ?? []).map((l:any) => (
              <tr key={l.id} className="border-t">
                <td className="p-2">{nameMap.get(l.item_id) ?? l.item_id}</td>
                <td className="p-2 text-right tabular-nums">{Number(l.qty_base ?? 0).toFixed(3)}</td>
                <td className="p-2 text-right tabular-nums">${Number(l.total_cost_usd ?? 0).toFixed(2)}</td>
              </tr>
            ))}
            {(lines ?? []).length === 0 && (
              <tr><td colSpan={3} className="p-3 text-neutral-400">No lines.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
