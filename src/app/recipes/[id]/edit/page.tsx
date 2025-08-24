// src/app/recipes/[id]/edit/page.tsx
'use client';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

type InvItem = { id: string; name: string; base_unit: string };
type SimpleRecipe = { id: string; name: string };

type Row =
  | { kind: 'item'; item_id: string; qty: number }
  | { kind: 'sub'; sub_recipe_id: string; qty: number };

export default function EditRecipePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const recipeId = params.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [inv, setInv] = useState<InvItem[]>([]);
  const [recipes, setRecipes] = useState<SimpleRecipe[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Load recipe + ingredients + inventory + other recipes
  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      const [
        { data: rData, error: rErr },
        { data: ingData, error: ingErr },
        { data: invData, error: invErr },
        { data: recList, error: recErr },
      ] = await Promise.all([
        supabase.from('recipes').select('id,name').eq('id', recipeId).single(),
        supabase
          .from('recipe_ingredients')
          .select('id,item_id,sub_recipe_id,qty,unit')
          .eq('recipe_id', recipeId)
          .order('id', { ascending: true }),
        supabase.from('inventory_items').select('id,name,base_unit').order('name', { ascending: true }),
        // other recipes for sub-recipe dropdown (exclude self)
        supabase.from('recipes').select('id,name').neq('id', recipeId).order('name', { ascending: true }),
      ]);

      if (rErr) return setError(rErr.message), setLoading(false);
      if (ingErr) return setError(ingErr.message), setLoading(false);
      if (invErr) return setError(invErr.message), setLoading(false);
      if (recErr) return setError(recErr.message), setLoading(false);

      setName(rData?.name ?? '');
      setRows(
        (ingData ?? []).map((r: any) => {
          const qty = Number(r.qty) || 0;
          if (r.sub_recipe_id) {
            return { kind: 'sub', sub_recipe_id: r.sub_recipe_id as string, qty };
          }
          return { kind: 'item', item_id: r.item_id as string, qty };
        })
      );
      setInv((invData ?? []) as InvItem[]);
      setRecipes((recList ?? []) as SimpleRecipe[]);
      setLoading(false);
    })();
  }, [recipeId]);

  const invById = useMemo(() => Object.fromEntries(inv.map((i) => [i.id, i])), [inv]);
  const recipeById = useMemo(() => Object.fromEntries(recipes.map((r) => [r.id, r])), [recipes]);

  function addRow(kind: 'item' | 'sub') {
    if (kind === 'item') setRows((r) => [...r, { kind: 'item', item_id: inv[0]?.id ?? '', qty: 0 }]);
    else setRows((r) => [...r, { kind: 'sub', sub_recipe_id: recipes[0]?.id ?? '', qty: 0 }]);
  }
  function removeRow(idx: number) {
    setRows((r) => r.filter((_, i) => i !== idx));
  }
  function updateRow(idx: number, patch: Partial<Row>) {
    setRows((r) =>
      r.map((row, i) => {
        if (i !== idx) return row;
        return { ...row, ...patch } as Row;
      })
    );
  }
  function changeKind(idx: number, kind: 'item' | 'sub') {
    setRows((r) =>
      r.map((row, i) => {
        if (i !== idx) return row;
        return kind === 'item'
          ? { kind: 'item', item_id: inv[0]?.id ?? '', qty: 0 }
          : { kind: 'sub', sub_recipe_id: recipes[0]?.id ?? '', qty: 0 };
      })
    );
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      // 1) update the recipe name
      const { error: upErr } = await supabase.from('recipes').update({ name }).eq('id', recipeId);
      if (upErr) throw upErr;

      // 2) replace ingredients
      const { error: delErr } = await supabase.from('recipe_ingredients').delete().eq('recipe_id', recipeId);
      if (delErr) throw delErr;

      const clean = rows
        .filter((r) => (r.kind === 'item' ? (r.item_id && r.qty > 0) : (r.sub_recipe_id && r.qty > 0)))
        .map((r) => {
          if (r.kind === 'item') {
            const unit = invById[r.item_id]?.base_unit ?? null;
            return { recipe_id: recipeId, item_id: r.item_id, sub_recipe_id: null, qty: r.qty, unit };
          }
          return { recipe_id: recipeId, item_id: null, sub_recipe_id: (r as any).sub_recipe_id, qty: r.qty, unit: 'portion' };
        });

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
    <div className="space-y-6">
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
          <div className="space-x-2">
            <button onClick={() => addRow('item')} className="border rounded px-3 py-1 hover:bg-neutral-900">+ Add item</button>
            <button onClick={() => addRow('sub')} className="border rounded px-3 py-1 hover:bg-neutral-900">+ Add recipe</button>
          </div>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-left">
              <th className="py-2">Type</th>
              <th className="py-2">Item / Recipe</th>
              <th className="py-2">Qty</th>
              <th className="py-2">Unit</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const unit =
                r.kind === 'item'
                  ? (invById[(r as any).item_id]?.base_unit ?? '—')
                  : 'portion';
              return (
                <tr key={i} className="border-t border-neutral-800">
                  <td className="py-2 pr-3">
                    <select
                      value={r.kind}
                      onChange={(e) => changeKind(i, e.target.value as 'item' | 'sub')}
                      className="bg-black border rounded px-2 py-1 w-full"
                    >
                      <option value="item">Item</option>
                      <option value="sub">Recipe</option>
                    </select>
                  </td>

                  <td className="py-2 pr-3">
                    {r.kind === 'item' ? (
                      <select
                        value={(r as any).item_id}
                        onChange={(e) => updateRow(i, { ...(r as any), item_id: e.target.value } as any)}
                        className="bg-black border rounded px-2 py-1 w-full"
                      >
                        {inv.map((it) => (
                          <option key={it.id} value={it.id}>
                            {it.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <select
                        value={(r as any).sub_recipe_id}
                        onChange={(e) => updateRow(i, { ...(r as any), sub_recipe_id: e.target.value } as any)}
                        className="bg-black border rounded px-2 py-1 w-full"
                      >
                        {recipes.map((rc) => (
                          <option key={rc.id} value={rc.id}>
                            {rc.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>

                  <td className="py-2 pr-3">
                    <input
                      type="number"
                      step="0.0001"
                      value={r.qty}
                      onChange={(e) => updateRow(i, { ...r, qty: Number(e.target.value) } as any)}
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
                <td colSpan={5} className="py-4 text-neutral-400">
                  No ingredients yet. Use “Add item” or “Add recipe”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
