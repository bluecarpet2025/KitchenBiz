import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { templates } from '@/lib/imports/registry';

type Payload = {
  type: 'receipts'|'sales'|'expenses';
  tenantId: string;
  fileName: string;
  headers: string[];
  rows: string[][];
  mapping: Record<string, string>;
};

export async function POST(req: Request) {
  const body = (await req.json()) as Payload;
  const { type, tenantId, headers, rows, mapping } = body;
  const tpl = templates[type];
  if (!tpl) return NextResponse.json({ error: 'Unknown type' }, { status: 400 });

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });

  const idx = (k: string) => headers.findIndex(h => mapping[h] === k);
  const dateIdx   = idx('date');
  const vendorIdx = idx('vendor');
  const noteIdx   = idx('note');
  const nameIdx   = idx('item_name');
  const qtyIdx    = idx('qty');
  const unitIdx   = idx('unit');       // not used in lines table; kept if you later store it
  const costIdx   = idx('total_cost');

  try {
    if (type !== 'receipts') {
      return NextResponse.json({ ok: true, message: 'Only receipts import implemented in this step.' });
    }

    if (dateIdx < 0 || nameIdx < 0 || qtyIdx < 0 || costIdx < 0) {
      throw new Error('Missing required mapped columns (date, item_name, qty, total_cost).');
    }

    // 1) Create header (doc)
    const purchasedAt = new Date(rows[0]?.[dateIdx] ?? Date.now());
    const { data: doc, error: docErr } = await supabase
      .from('inventory_receipt_docs')
      .insert({
        tenant_id: tenantId,
        purchased_at: purchasedAt.toISOString(),
        vendor: vendorIdx >= 0 ? rows[0]?.[vendorIdx] ?? null : null,
        note:   noteIdx   >= 0 ? rows[0]?.[noteIdx]   ?? null : null,
        created_by: user.id,
      })
      .select('id')
      .single();
    if (docErr) throw docErr;

    // 2) Resolve items (by name, create if missing)
    const names = Array.from(
      new Set(rows.map(r => String(r[nameIdx] ?? '').trim()).filter(Boolean))
    );
    let itemsMap = new Map<string, string>(); // name -> item_id

    if (names.length) {
      const { data: existing } = await supabase
        .from('inventory_items')
        .select('id,name')
        .eq('tenant_id', tenantId)
        .in('name', names);

      (existing ?? []).forEach((it: any) => itemsMap.set(String(it.name), String(it.id)));

      const toCreate = names.filter(n => !itemsMap.has(n)).map(n => ({
        tenant_id: tenantId,
        name: n,
        base_unit: 'g',
        purchase_unit: 'kg',
        pack_to_base_factor: 1000,
        last_price: 0
      }));

      if (toCreate.length) {
        const { data: created, error: cErr } = await supabase
          .from('inventory_items')
          .insert(toCreate)
          .select('id,name');
        if (cErr) throw cErr;
        (created ?? []).forEach((it: any) => itemsMap.set(String(it.name), String(it.id)));
      }
    }

    // 3) Build line inserts
    const lineRows = rows.map(r => {
      const itemName = String(r[nameIdx] ?? '').trim();
      const itemId = itemsMap.get(itemName);
      const qty = Number((r[qtyIdx] ?? '0').toString().replace(/[^0-9.\-]+/g,''));
      const total = Number((r[costIdx] ?? '0').toString().replace(/[^0-9.\-]+/g,''));
      const d = new Date(r[dateIdx] ?? purchasedAt);
      return {
        tenant_id: tenantId,
        receipt_doc_id: doc!.id,
        item_id: itemId,
        qty_base: qty,
        total_cost_usd: total,
        purchased_at: d.toISOString(),
        note: noteIdx >= 0 ? String(r[noteIdx] ?? '').trim() : null
      };
    }).filter(l => l.item_id && l.qty_base > 0);

    if (lineRows.length) {
      const { error: lErr } = await supabase
        .from('inventory_receipts')
        .insert(lineRows);
      if (lErr) throw lErr;
    }

    return NextResponse.json({ ok: true, docId: doc!.id });
  } catch (e:any) {
    return NextResponse.json({ error: e?.message ?? 'Import failed' }, { status: 400 });
  }
}
