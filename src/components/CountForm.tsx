"use client";
import { useMemo, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/browser";

type Item = { id: string; name: string; base_unit: string | null };
type Row = { item_id: string; name: string; base_unit: string; counted_qty: number };
type Props = { items: Item[]; expectedMap: Record<string, number> };

export default function CountForm({ items: initialItems, expectedMap }: Props) {
  const supabase = createBrowserClient();

  const [items, setItems] = useState<Item[]>(initialItems);
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<Row[]>(
    () =>
      initialItems.map(it => ({
        item_id: it.id,
        name: it.name,
        base_unit: it.base_unit || "",
        counted_qty: Number(expectedMap[it.id] ?? 0),
      })) as Row[]
  );
  const [saving, setSaving] = useState(false);
  const totalLines = rows.length;

  // inline “new item” controls, per-row
  const [newIdx, setNewIdx] = useState<number | null>(null);
  const [newItem, setNewItem] = useState({ name: "", base_unit: "g" as string });

  const deltas = useMemo(
    () =>
      rows.map(r => {
        const expected = Number(expectedMap[r.item_id] ?? 0);
        const delta = Number(r.counted_qty) - expected;
        return { ...r, expected, delta };
      }),
    [rows, expectedMap]
  );

  async function createNewItem(forRow: number) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { alert("Not signed in"); return; }
    const { data: profile, error: pErr } = await supabase
      .from("profiles").select("tenant_id").eq("id", user.id).single();
    if (pErr || !profile?.tenant_id) { alert("No tenant"); return; }

    const { data, error } = await supabase
      .from("inventory_items")
      .insert({
        tenant_id: profile.tenant_id,
        name: newItem.name.trim(),
        base_unit: newItem.base_unit,
        purchase_unit: "kg",
        pack_to_base_factor: newItem.base_unit === "g" ? 1000 : 1,
        last_price: 0
      })
      .select("id, name, base_unit")
      .single();
    if (error) { alert(error.message); return; }

    const inserted = data as Item;
    setItems(prev => [...prev, inserted]);
    setRows(prev => prev.map((x,i) =>
      i===forRow
        ? { ...x, item_id: inserted.id, name: inserted.name, base_unit: inserted.base_unit || "", counted_qty: 0 }
        : x
    ));
    setNewIdx(null);
    setNewItem({ name: "", base_unit: "g" });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const { data: profile } = await supabase
        .from("profiles").select("tenant_id").eq("id", user.id).single();
      const tenantId = profile?.tenant_id;
      if (!tenantId) throw new Error("No tenant");

      // 1) header
      const { data: count, error: cErr } = await supabase
        .from("inventory_counts")
        .insert({ tenant_id: tenantId, note, created_by: user.id, status: "draft" })
        .select("id")
        .single();
      if (cErr) throw cErr;

      // 2) lines
      const linePayload = rows.map(r => ({
        tenant_id: tenantId,
        count_id: count.id,
        item_id: r.item_id,
        counted_qty: Number(r.counted_qty) || 0,
      }));
      const { error: lErr } = await supabase.from("inventory_count_lines").insert(linePayload);
      if (lErr) throw lErr;

      // 3) commit
      const { data: results, error: rpcErr } = await supabase.rpc("commit_inventory_count", {
        p_count_id: count.id,
        p_actor: user.id,
      });
      if (rpcErr) throw rpcErr;

      const loss = (results || []).filter((r: any) => r.status === "loss").length;
      const over = (results || []).filter((r: any) => r.status === "overage").length;

      alert(`Count committed.\nLines: ${totalLines}\nLosses: ${loss}\nOverages: ${over}`);
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Error committing count");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4">
      <label className="text-sm block">
        Count note (optional)
        <input
          className="mt-1 w-full border rounded-md px-2 py-1 bg-black text-white border-neutral-700"
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="e.g., End of day 8/18, John M."
        />
      </label>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-2">Item</th>
              <th className="text-right p-2">Expected</th>
              <th className="text-right p-2">Counted</th>
              <th className="text-right p-2">Δ</th>
              <th className="text-left p-2">Unit</th>
            </tr>
          </thead>
          <tbody>
            {deltas.map((r, idx) => (
              <tr key={rows[idx].item_id || `row-${idx}`} className="border-t align-top">
                <td className="p-2">
                  <div className="flex items-center gap-2">
                    <select
                      className="min-w-[14rem] border rounded-md px-2 py-1 bg-black text-white border-neutral-700"
                      value={rows[idx].item_id}
                      onChange={e => {
                        const id = e.target.value;
                        const it = items.find(i => i.id === id);
                        setRows(prev => prev.map((x,i) =>
                          i===idx ? { ...x, item_id: id, name: it?.name || "", base_unit: it?.base_unit || "", counted_qty: 0 } : x
                        ));
                      }}
                    >
                      <option value="">Select item…</option>
                      {items.sort((a,b)=>a.name.localeCompare(b.name)).map(it => (
                        <option key={it.id} value={it.id}>{it.name}</option>
                      ))}
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
                        onChange={e=>setNewItem(s=>({ ...s, name: e.target.value }))}
                      />
                      <select
                        className="border rounded-md px-2 py-1 bg-black text-white border-neutral-700"
                        value={newItem.base_unit}
                        onChange={e=>setNewItem(s=>({ ...s, base_unit: e.target.value }))}
                      >
                        <option>g</option><option>ml</option><option>each</option><option>oz</option><option>lb</option>
                      </select>
                      <button type="button" className="px-2 py-1 border rounded hover:bg-neutral-900" onClick={()=>createNewItem(idx)}>Save</button>
                      <button type="button" className="text-xs underline opacity-70" onClick={()=>setNewIdx(null)}>Cancel</button>
                    </div>
                  )}
                </td>
                <td className="p-2 text-right tabular-nums">{fmt(r.expected)}</td>
                <td className="p-2">
                  <input
                    type="number"
                    step="0.01"
                    className="w-full border rounded-md px-2 py-1 text-right bg-black text-white border-neutral-700"
                    value={rows[idx].counted_qty}
                    onChange={e =>
                      setRows(prev =>
                        prev.map((x, i) =>
                          i === idx ? { ...x, counted_qty: Number(e.target.value) } : x
                        )
                      )
                    }
                  />
                </td>
                <td className={`p-2 text-right tabular-nums ${r.delta<0?'text-red-600':r.delta>0?'text-emerald-600':''}`}>
                  {fmt(r.delta)}
                </td>
                <td className="p-2">{rows[idx].base_unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button disabled={saving} className="px-3 py-2 rounded-md border hover:bg-muted">
        {saving ? "Committing…" : "Commit Count"}
      </button>
    </form>
  );
}

function fmt(n: number) {
  return Number.isInteger(n)
    ? String(n)
    : (Math.abs(n) < 10 ? n.toFixed(2) : n.toFixed(1)).replace(/\.0$/, "");
}
