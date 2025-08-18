"use client";
import { useState } from "react";
import { createBrowserClient } from "@/lib/supabase/browser";

type Item = { id: string; name: string; base_unit: string | null };

export default function NewPurchaseForm({ items }: { items: Item[] }) {
  const supabase = createBrowserClient();
  const [rows, setRows] = useState([{ item_id: "", qty: "", unit: "", cost_total: "" }]);
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0,10));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const addRow = () => setRows(r => [...r, { item_id: "", qty: "", unit: "", cost_total: "" }]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const { data: profile } = await supabase.from("profiles").select("tenant_id").eq("id", user.id).single();
      const tenantId = profile?.tenant_id;
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
          <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="mt-1 w-full border rounded-md px-2 py-1" required />
        </label>
        <label className="sm:col-span-2 text-sm">
          Note (optional)
          <input value={note} onChange={e=>setNote(e.target.value)} className="mt-1 w-full border rounded-md px-2 py-1" placeholder="Invoice #, vendor, etc." />
        </label>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-2">Item</th>
              <th className="text-right p-2">Qty</th>
              <th className="text-left p-2">Unit</th>
              <th className="text-right p-2">Cost (total)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={idx} className="border-t">
                <td className="p-2">
                  <select className="w-full border rounded-md px-2 py-1"
                    value={r.item_id}
                    onChange={e => {
                      const v = e.target.value;
                      setRows(prev => prev.map((x,i)=> i===idx ? {...x, item_id: v, unit: items.find(it=>it.id===v)?.base_unit || ""} : x));
                    }}>
                    <option value="">Select item…</option>
                    {items.map(it => <option key={it.id} value={it.id}>{it.name}</option>)}
                  </select>
                </td>
                <td className="p-2">
                  <input type="number" step="0.01" className="w-full border rounded-md px-2 py-1 text-right"
                    value={r.qty}
                    onChange={e => setRows(prev => prev.map((x,i)=> i===idx ? {...x, qty: e.target.value} : x))}
                  />
                </td>
                <td className="p-2">
                  <input className="w-full border rounded-md px-2 py-1"
                    value={r.unit}
                    onChange={e => setRows(prev => prev.map((x,i)=> i===idx ? {...x, unit: e.target.value} : x))}
                    placeholder="auto-fills base unit"
                  />
                </td>
                <td className="p-2">
                  <input type="number" step="0.01" className="w-full border rounded-md px-2 py-1 text-right"
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
