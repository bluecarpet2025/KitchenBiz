// src/app/recipes/[id]/edit/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

type InvItem = { id: string; name: string; base_unit: string };
type Row = { id?: string; item_id: string; qty: number };

export default function EditRecipePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const recipeId = params.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [inv, setInv] = useState<InvItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Load recipe + ingredients + inventory
  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);

      const [{ data: rData, error: rErr }, { data: ingData, error: ingErr }, { data: invData, error: invErr }] =
        await Promise.all([
          supabase.from('recipes').select('id,name').eq('id', recipeId).single(),
          supabase
            .from('recipe_ingredients')
            .select('id,item_id,qty')
            .eq('recipe_id', recipeId)
            .order('id', { ascending: true }),
          supabase.from('inventory_items').select('id,name,base_unit').order('name', { ascending: true }),
        ]);

      if (rErr) return setError(rErr.message), setLoading(false);
      if (ingErr) return setError(ingErr.message), setLoading(false);
      if (invErr) return setError(invErr.message), setLoading(false);

      setName(rData?.name ?? '');
      setRows((ingData ?? []).map((r) => ({ id: r.id, item_id: r.item_id, qty: Number(r.qty) || 0 })));
      setInv((invData ?? []) as InvItem[]);
      setLoading(false);
    })();
  }, [recipeId]);

  const invById = useMemo(() => Object.fromEntries(inv.map((i) => [i.id, i])), [inv]);

  function addRow() {
    setRows((r) => [...r, { item_id: inv[0]?.id ?? '', qty: 0 }]);
  }
  function removeRow(idx: number) {
    setRows((r) => r.filter((_, i) => i !== idx));
  }
  function updateRow(idx: number, patch: Partial<Row>) {
    setRows((r) => r.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      // 1) update the recipe name
      const { error: upErr } = await supabase.from('recipes').update({ name }).eq('id', recipeId);
      if (upErr) throw upErr;

      // 2) replace ingredients (simple + safe)
      const { error: delErr } = await supabase.from('recipe_ingredients').delete().eq('recipe_id', recipeId);
      if (delErr) throw delErr;

      const clean = rows
        .filter((r) => r.item_id && r.qty > 0)
        .map((r) => ({ recipe_id: recipeId, item_id: r.item_id, qty: r.qty }));

      if (clean.length) {
        const { error: insErr } = await supabase.from('recipe_ingredients').insert(clean);
        if (insErr) throw insErr;
      }

      router.push(`/recipes/${recipeId}`);
    } catch (e: any) {
      setError(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-4">Loading…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Edit Recipe</h1>
        <div className="space-x-2">
          <button
            onClick={() => router.push(`/recipes/${recipeId}`)}
            className="border rounded px-3 py-1 hover:bg-neutral-900"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="bg-white text-black rounded px-3 py-1 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {error && <div className="text-red-500">{error}</div>}

      <div className="space-y-3">
        <label className="block text-sm">Recipe name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full bg-black border rounded px-3 py-2"
          placeholder="e.g. Cheese Pizza 10”"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Ingredients (per serving)</h2>
          <button onClick={addRow} className="border rounded px-3 py-1 hover:bg-neutral-900">
            + Add ingredient
          </button>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-left">
              <th className="py-2">Item</th>
              <th className="py-2">Qty</th>
              <th className="py-2">Unit</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const unit = invById[r.item_id]?.base_unit ?? '-';
              return (
                <tr key={i} className="border-t border-neutral-800">
                  <td className="py-2 pr-3">
                    <select
                      value={r.item_id}
                      onChange={(e) => updateRow(i, { item_id: e.target.value })}
                      className="bg-black border rounded px-2 py-1 w-full"
                    >
                      {inv.map((it) => (
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
                      value={r.qty}
                      onChange={(e) => updateRow(i, { qty: Number(e.target.value) })}
                      className="bg-black border rounded px-2 py-1 w-full"
                    />
                  </td>
                  <td className="py-2 pr-3 text-neutral-300">{unit}</td>
                  <td className="py-2 text-right">
                    <button onClick={() => removeRow(i)} className="text-red-400 hover:underline">
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 text-neutral-400">
                  No ingredients yet. Click “Add ingredient”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
