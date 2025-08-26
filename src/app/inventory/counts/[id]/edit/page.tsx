// src/app/inventory/counts/[id]/edit/page.tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type InvItem = { id: string; name: string; base_unit: string };
type Line = { item_id: string; counted_qty: number };

export default function EditCountPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string>("");
  const [lines, setLines] = useState<Line[]>([]);
  const [items, setItems] = useState<InvItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError(null);

        // load count header
        const { data: count, error: cErr } = await supabase
          .from("inventory_counts")
          .select("note")
          .eq("id", id)
          .maybeSingle();
        if (cErr) throw cErr;
        setNote(count?.note ?? "");

        // load lines
        const { data: lineRaw, error: lErr } = await supabase
          .from("inventory_count_lines")
          .select("item_id,counted_qty")
          .eq("count_id", id)
          .order("item_id");
        if (lErr) throw lErr;
        setLines(
          (lineRaw ?? []).map((r: any) => ({
            item_id: r.item_id,
            counted_qty: Number(r.counted_qty ?? 0),
          }))
        );

        // inventory items for dropdowns
        const { data: inv, error: iErr } = await supabase
          .from("inventory_items")
          .select("id,name,base_unit")
          .order("name");
        if (iErr) throw iErr;
        setItems((inv ?? []) as InvItem[]);
      } catch (e: any) {
        setError(e.message ?? "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const itemsById = useMemo(
    () => Object.fromEntries(items.map((i) => [i.id, i])),
    [items]
  );

  function addLine() {
    if (items.length === 0) return;
    setLines((l) => [...l, { item_id: items[0].id, counted_qty: 0 }]);
  }
  function updateLine(idx: number, patch: Partial<Line>) {
    setLines((l) => l.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  }
  function removeLine(idx: number) {
    setLines((l) => l.filter((_, i) => i !== idx));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      // update header
      const { error: uErr } = await supabase
        .from("inventory_counts")
        .update({ note })
        .eq("id", id);
      if (uErr) throw uErr;

      // replace lines
      const { error: dErr } = await supabase
        .from("inventory_count_lines")
        .delete()
        .eq("count_id", id);
      if (dErr) throw dErr;

      const clean = lines
        .filter((r) => r.item_id && Number(r.counted_qty) >= 0)
        .map((r) => ({
          count_id: id,
          item_id: r.item_id,
          counted_qty: Number(r.counted_qty),
        }));
      if (clean.length) {
        const { error: iErr } = await supabase
          .from("inventory_count_lines")
          .insert(clean);
        if (iErr) throw iErr;
      }

      // Note: We are not rewriting inventory_adjustments here (keeps it safe).
      // We can add a "Reapply adjustments" admin action later if you want.

      router.push(`/inventory/counts/${id}`);
    } catch (e: any) {
      setError(e.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <main className="p-6">Loading…</main>;

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Edit Inventory Count</h1>
        <div className="space-x-2">
          <button
            onClick={() => router.push(`/inventory/counts/${id}`)}
            className="border rounded px-3 py-1 hover:bg-neutral-900"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="bg-white text-black rounded px-3 py-1 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {error && <div className="text-red-500">{error}</div>}

      <div className="space-y-3">
        <label className="block text-sm">Note</label>
        <input
          value={note ?? ""}
          onChange={(e) => setNote(e.target.value)}
          className="w-full bg-black border rounded px-3 py-2"
          placeholder="Optional note"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Lines</h2>
          <button onClick={addLine} className="border rounded px-3 py-1 hover:bg-neutral-900">
            + Add line
          </button>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-left">
              <th className="py-2">Item</th>
              <th className="py-2 text-right">Qty (base)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lines.map((r, i) => {
              const unit = itemsById[r.item_id]?.base_unit ?? "—";
              return (
                <tr key={i} className="border-t border-neutral-800">
                  <td className="py-2 pr-3">
                    <select
                      value={r.item_id}
                      onChange={(e) => updateLine(i, { item_id: e.target.value })}
                      className="bg-black border rounded px-2 py-1 w-full"
                    >
                      {items.map((it) => (
                        <option key={it.id} value={it.id}>
                          {it.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      type="number"
                      step="0.0001"
                      value={r.counted_qty}
                      onChange={(e) =>
                        updateLine(i, { counted_qty: Number(e.target.value) })
                      }
                      className="bg-black border rounded px-2 py-1 w-full text-right"
                    />
                    <div className="text-xs opacity-70 text-right mt-1">{unit}</div>
                  </td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => removeLine(i)}
                      className="text-red-400 hover:underline"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
            {lines.length === 0 && (
              <tr>
                <td colSpan={3} className="py-4 text-neutral-400">
                  No lines yet. Click “Add line”.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <p className="text-xs opacity-70">
          Editing lines here doesn’t change past stock movements; adjustments are
          separate. We can add a “Reapply adjustments” action next.
        </p>
      </div>
    </main>
  );
}
