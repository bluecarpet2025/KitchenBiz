"use client";
import { useState } from "react";
import { createBrowserClient } from "@/lib/supabase/browser";

type Item = { id: string; name: string; base_unit: string | null };

export default function NewPurchaseForm({ items: initialItems }: { items: Item[] }) {
  const supabase = createBrowserClient();

  const [items, setItems] = useState<Item[]>(initialItems);
  const [rows, setRows] = useState([{ item_id: "", qty: "", unit: "", cost_total: "" }]);
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0,10));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  // new-item inline state (applies to the last touched row)
  const [newIdx, setNewIdx] = useState<number | null>(null);
  const [newItem, setNewItem] = useState({ name: "", base_unit: "g" as string });

  const addRow = () => setRows(r => [...r, { item_id: "", qty: "", unit: "", cost_total: "" }]);

  async function createNewItem(forRow: number) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { alert("Sign in required"); return; }
    const { data: profile } = await supabase.from("profiles").select("tenant_id").eq("id", user.id).single();
    const tenantId = (profile as any)?.tenant_id;
    if (!tenantId) { alert("No tenant"); return; }

    const { data, error } = await supabase
      .from("inventory_items")
      .insert({
        tenant_id: tenantId,
        name: newItem.name.trim(),
        base_unit: newItem.base_unit,
        purchase_unit: "kg",
        pack_to_base_factor: newItem.base_unit === "g" ? 1000 : 1,
        last_price: 0
      })
      .select("id, name, base_unit")
      .single();
    if (error) { alert(error.message); return; }

    // update local item list and row selection
    const inserted = data as Item;
    setItems(prev => [...prev, inserted]);
    setRows(prev =>
      prev.map((x,i) => i===forRow ? { ...x, item_id: inserted.id, unit: inserted.base_unit || "" } : x)
    );
    setNewIdx(null);
    setNewItem({ name: "", base_unit: "g" });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const { data: profile } = await supabase.from("profiles").select("tenant_id").eq("id", user.id).single();
      const tenantId = (profile as any)?.tenant_id;
      if (!tenantId) throw new Error("No tenant");

      const payload = rows
        .filter(r => r.item_id && Number(r.qty) > 0)
        .map(r => ({
          tenant_id: tenantId,
          item_id: r.item_id,
          qty: Number(r.qty),
          unit: r.unit || items.find(i => i.id === r.item_id)?.base_unit || null,
          tx_type: "purchase",
          occurred_at: new Date(date).toISOString(),
          note: note || null,
          cost_total: r.cost_total ? Number(r.cost_total) : null,
          created_by: user.id
        }));

      if (payload.length === 0) { alert("Add at least one line."); setSaving(false); return; }

      const { error } = await supabase.from("inventory_transactions").insert(payload);
      if (error) throw error;

      alert("Saved purchase.");
      setRows([{ item_id: "", qty: "", unit: "", cost_total: "" }]);
      setNote("");
    } catch (err:any) {
      console.error(err);
      alert(err.message || "Error saving purchase");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <label className="text-sm">
          Purchase date
          <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="mt-1 w-full border rounded-md px-2 py-1 bg-black text-white border-neutral-700" required />
        </label>
        <label className="sm:col-span-2 text-sm">
          Note (optional)
          <input value={note} onChange={e=>setNote(e.target.value)} className="mt-1 w-full border rounded-md px-2 py-1 bg-black text-white border-neutral-700" placeholder="Invoice #, vendor, etc." />
        </label>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-center p-2">Item</th>
              <th className="text-center p-2">Qty</th>
              <th className="text-center p-2">Unit</th>
              <th className="text-center p-2">Cost (total)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={idx} className="border-t align-top">
                <td className="p-2">
                  <div className="flex items-center gap-2">
                    <select
                      className="min-w-[14rem] border rounded-md px-2 py-1 bg-black text-white border-neutral-700"
                      value={r.item_id}
                      onChange={e => {
                        const v = e.target.value;
                        setRows(prev => prev.map((x,i)=> i===idx ? {...x, item_id: v, unit: items.find(it=>it.id===v)?.base_unit || ""} : x));
                      }}>
                      <option value="">Select item…</option>
                      {items.sort((a,b)=>a.name.localeCompare(b.name)).map(it => <option key={it.id} value={it.id}>{it.name}</option>)}
                    </select>
                    <button
                      type="button"
                      className="text-xs underline whitespace-nowrap"
                      onClick={() => { setNewIdx(idx); setNewItem({ name: "", base_unit: "g" }); }}
                    >
                      + New item
                    </button>
                  </div>

                  {newIdx === idx && (
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        className="border rounded-md px-2 py-1 bg-black text-white border-neutral-700"
                        placeholder="Item name"
                        value={newItem.name}
                        onChange={(e)=>setNewItem(s=>({ ...s, name: e.target.value }))}
                      />
                      <select
                        className="border rounded-md px-2 py-1 bg-black text-white border-neutral-700"
                        value={newItem.base_unit}
                        onChange={e=>setNewItem(s=>({ ...s, base_unit: e.target.value }))}
                      >
                        <option>g</option><option>ml</option><option>each</option><option>oz</option><option>lb</option>
                      </select>
                      <button
                        type="button"
                        className="px-2 py-1 border rounded hover:bg-neutral-900"
                        onClick={()=>createNewItem(idx)}
                      >
                        Save
                      </button>
                      <button type="button" className="text-xs underline opacity-70" onClick={()=>setNewIdx(null)}>Cancel</button>
                    </div>
                  )}
                </td>
                <td className="p-2">
                  <input
                    type="number" step="0.01"
                    className="w-full border rounded-md px-2 py-1 text-right bg-black text-white border-neutral-700"
                    value={r.qty}
                    onChange={e => setRows(prev => prev.map((x,i)=> i===idx ? {...x, qty: e.target.value} : x))}
                  />
                </td>
                <td className="p-2">
                  <input
                    className="w-full border rounded-md px-2 py-1 bg-black text-white border-neutral-700"
                    value={r.unit}
                    onChange={e => setRows(prev => prev.map((x,i)=> i===idx ? {...x, unit: e.target.value} : x))}
                    placeholder="auto-fills base unit"
                  />
                </td>
                <td className="p-2">
                  <input
                    type="number" step="0.01"
                    className="w-full border rounded-md px-2 py-1 text-right bg-black text-white border-neutral-700"
                    value={r.cost_total}
                    onChange={e => setRows(prev => prev.map((x,i)=> i===idx ? {...x, cost_total: e.target.value} : x))}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="p-2">
          <button type="button" onClick={addRow} className="text-sm underline">+ Add line</button>
        </div>
      </div>

      <button disabled={saving} className="px-3 py-2 rounded-md border hover:bg-muted">
        {saving ? "Saving…" : "Save Purchase"}
      </button>
    </form>
  );
}
