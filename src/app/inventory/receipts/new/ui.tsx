'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Item = { id: string; name: string; base_unit: string | null };
type Line = { item_id: string; qty_base: string; total_cost_usd: string };

export default function NewReceiptClient() {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0,10));
  const [vendor, setVendor] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<Line[]>([{ item_id: '', qty_base: '', total_cost_usd: '' }]);
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) return;
      const { data: prof } = await supabase.from('profiles').select('tenant_id').eq('id', uid).maybeSingle();
      const tid = prof?.tenant_id ?? null;
      setTenantId(tid);
      if (tid) {
        const { data: it } = await supabase
          .from('inventory_items')
          .select('id,name,base_unit')
          .eq('tenant_id', tid)
          .order('name');
        setItems((it ?? []) as any[]);
      }
    })();
  }, []);

  function addLine() { setLines(ls => [...ls, { item_id: items[0]?.id ?? '', qty_base: '', total_cost_usd: '' }]); }
  function removeLine(i:number) { setLines(ls => ls.filter((_,idx) => idx !== i)); }

  async function save() {
    if (!tenantId) { alert('No tenant'); return; }
    const valid = lines.filter(l => l.item_id && Number(l.qty_base) > 0);
    if (valid.length === 0) { alert('Add at least one line'); return; }

    try {
      setBusy(true); setStatus('Saving…');

      // 1) Create header
      const { data: doc, error: dErr } = await supabase
        .from('inventory_receipt_docs')
        .insert({
          tenant_id: tenantId,
          purchased_at: new Date(date).toISOString(),
          vendor, note
        })
        .select('id')
        .single();
      if (dErr) throw dErr;

      // 2) Upload photo and set doc.photo_url
      if (photo) {
        const ext = photo.name.split('.').pop() ?? 'jpg';
        const path = `receipts/tenant_${tenantId}/${doc!.id}.${ext}`;
        const { error: upErr } = await supabase.storage.from('receipts').upload(path, photo, { upsert: true });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from('receipts').getPublicUrl(path);
        await supabase.from('inventory_receipt_docs').update({ photo_url: pub.publicUrl }).eq('id', doc!.id);
      }

      // 3) Insert lines into EXISTING table
      const payload = valid.map(l => ({
        tenant_id: tenantId,
        receipt_doc_id: doc!.id,
        item_id: l.item_id,
        qty_base: Number(l.qty_base || 0),
        total_cost_usd: Number(l.total_cost_usd || 0),
        purchased_at: new Date(date).toISOString(),
        note: note || null
      }));
      const { error: lErr } = await supabase.from('inventory_receipts').insert(payload);
      if (lErr) throw lErr;

      setStatus('Saved.');
      window.location.href = `/inventory/receipts/${doc!.id}`;
    } catch (e:any) {
      setStatus(e?.message ?? 'Error');
      alert(e?.message ?? 'Failed to save');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-semibold">New Purchase</h1>

      <div className="grid md:grid-cols-3 gap-3">
        <div>
          <div className="text-xs opacity-75">Purchase date</div>
          <input type="date" className="w-full border rounded px-3 py-2 bg-neutral-950"
            value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div>
          <div className="text-xs opacity-75">Vendor</div>
          <input className="w-full border rounded px-3 py-2 bg-neutral-950"
            value={vendor} onChange={e => setVendor(e.target.value)} />
        </div>
        <div>
          <div className="text-xs opacity-75">Note</div>
          <input className="w-full border rounded px-3 py-2 bg-neutral-950"
            value={note} onChange={e => setNote(e.target.value)} />
        </div>
      </div>

      <div className="border rounded p-3">
        <div className="font-semibold mb-2">Lines</div>
        <div className="space-y-2">
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-[1fr_140px_160px_80px] gap-2">
              <select className="border rounded px-2 py-1 bg-neutral-950"
                value={l.item_id}
                onChange={e => setLines(s => s.map((x,j) => j===i ? { ...x, item_id: e.target.value } : x))}
              >
                <option value="">Select item…</option>
                {items.map(it => <option key={it.id} value={it.id}>{it.name}</option>)}
              </select>
              <input placeholder="Qty (base)" type="number" step="0.001" className="border rounded px-2 py-1 bg-neutral-950 text-right"
                value={l.qty_base} onChange={e => setLines(s => s.map((x,j)=> j===i ? {...x, qty_base: e.target.value } : x))} />
              <input placeholder="Total cost" type="number" step="0.01" className="border rounded px-2 py-1 bg-neutral-950 text-right"
                value={l.total_cost_usd} onChange={e => setLines(s => s.map((x,j)=> j===i ? {...x, total_cost_usd: e.target.value } : x))} />
              <button className="text-xs underline" onClick={() => removeLine(i)}>Remove</button>
            </div>
          ))}
        </div>
        <div className="mt-2"><button className="text-sm underline" onClick={addLine}>+ Add line</button></div>
      </div>

      <div>
        <div className="text-xs opacity-75">Photo (optional)</div>
        <input type="file" accept="image/*" onChange={e => setPhoto(e.target.files?.[0] ?? null)} />
      </div>

      <div className="flex items-center justify-end gap-2">
        <a href="/inventory/receipts" className="px-3 py-2 border rounded">Cancel</a>
        <button disabled={busy} onClick={save}
          className="px-4 py-2 bg-white text-black rounded font-medium disabled:opacity-50">Save Purchase</button>
      </div>

      {status && <div className="text-sm opacity-80">{status}</div>}
    </main>
  );
}
