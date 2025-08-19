'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Recipe = {
  id: string; name: string;
  batch_yield_qty: number | null; batch_yield_unit: string | null; yield_pct: number | null;
};
type Ingredient = { recipe_id: string; item_id: string; qty: number };
type Item = { id: string; name: string; base_unit: string; pack_to_base_factor: number; last_price: number | null };

type Sel = Record<string, number>; // recipeId -> portions to prep

export default function PrepListPage() {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [ingByRecipe, setIngByRecipe] = useState<Record<string, Ingredient[]>>({});
  const [itemsById, setItemsById] = useState<Record<string, Item>>({});
  const [sel, setSel] = useState<Sel>({});
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      // tenant
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) { setStatus('Not signed in'); setLoading(false); return; }
      const { data: prof } = await supabase.from('profiles').select('tenant_id').eq('id', uid).maybeSingle();
      if (!prof?.tenant_id) { setStatus('No tenant'); setLoading(false); return; }
      setTenantId(prof.tenant_id);

      // recipes
      const { data: recs } = await supabase
        .from('recipes')
        .select('id,name,batch_yield_qty,batch_yield_unit,yield_pct')
        .eq('tenant_id', prof.tenant_id)
        .order('name');
      const rList = (recs ?? []) as Recipe[];
      setRecipes(rList);

      // ingredients for all recipes
      const rIds = rList.map(r => r.id);
      if (rIds.length) {
        const { data: ing } = await supabase
          .from('recipe_ingredients')
          .select('recipe_id,item_id,qty')
          .in('recipe_id', rIds);
        const ingList = (ing ?? []) as Ingredient[];

        const map: Record<string, Ingredient[]> = {};
        for (const row of ingList) {
          if (!map[row.recipe_id]) map[row.recipe_id] = [];
          map[row.recipe_id].push(row);
        }
        setIngByRecipe(map);

        // items used
        const itemIds = Array.from(new Set(ingList.map(i => i.item_id)));
        if (itemIds.length) {
          const { data: items } = await supabase
            .from('inventory_items')
            .select('id,name,base_unit,pack_to_base_factor,last_price')
            .in('id', itemIds);
          const iMap: Record<string, Item> = {};
          (items ?? []).forEach((it: any) => (iMap[it.id] = it as Item));
          setItemsById(iMap);
        }
      }

      setLoading(false);
    })();
  }, []);

  async function loadFromLastMenu() {
    if (!tenantId) return;
    setStatus('Loading last menu…');
    const { data: menus } = await supabase
      .from('menus')
      .select('id')
      .eq('tenant_id', tenantId)
      .order('served_on', { ascending: false })
      .limit(1);
    if (!menus?.length) { setStatus('No previous menu'); return; }

    const lastId = menus[0].id;
    const { data: rows } = await supabase
      .from('menu_recipes')
      .select('recipe_id, servings')
      .eq('menu_id', lastId);

    const next: Sel = {};
    (rows ?? []).forEach(r => { next[r.recipe_id] = Number(r.servings || 1); });
    setSel(next);
    setStatus('Loaded last menu items. Adjust portions as needed.');
  }

  function addRecipe(id: string) {
    setSel(s => ({ ...s, [id]: s[id] ?? 1 }));
  }
  function removeRecipe(id: string) {
    setSel(s => {
      const c = { ...s };
      delete c[id];
      return c;
    });
  }
  function setQty(id: string, n: number) {
    setSel(s => ({ ...s, [id]: Math.max(0, Math.floor(n)) }));
  }

  // SAVE AS MENU
  async function saveAsMenu() {
    try {
      if (!tenantId) { alert("No tenant"); return; }
      const entries = Object.entries(sel).filter(([, v]) => v > 0);
      if (entries.length === 0) { alert("Add at least one recipe."); return; }

      const defaultName = `Prep ${new Date().toLocaleDateString()}`;
      // simple prompt for a name
      const name = window.prompt("Menu name:", defaultName);
      if (!name) return;

      setSaving(true);

      // insert menu
      const { data: m, error: mErr } = await supabase
        .from("menus")
        .insert({ tenant_id: tenantId, name })
        .select("id")
        .single();
      if (mErr) throw mErr;

      const menuId = m?.id as string;

      // insert menu_recipes
      const rows = entries.map(([recipe_id, servings]) => ({
        menu_id: menuId,
        recipe_id,
        servings: Number(servings)
      }));
      const { error: rErr } = await supabase.from("menu_recipes").insert(rows);
      if (rErr) throw rErr;

      // go to menu page with banner
      window.location.assign(`/menu?menu_id=${menuId}&created=1`);
    } catch (err: any) {
      console.error(err);
      alert(err.message ?? "Error saving menu");
    } finally {
      setSaving(false);
    }
  }

  // Aggregate ingredient totals across selected recipes
  const totals = useMemo(() => {
    const sum: Record<string, number> = {};
    for (const rid of Object.keys(sel)) {
      const portionsToPrep = sel[rid] || 0;
      const r = recipes.find(x => x.id === rid);
      if (!r) continue;
      const portions = Math.max(1, Number(r.batch_yield_qty ?? 1));
      const yieldPct = Number(r.yield_pct ?? 1);
      const rows = ingByRecipe[rid] ?? [];
      for (const ing of rows) {
        // qty is per batch; convert to per-serving
        const perServing = portions ? (Number(ing.qty || 0) * (yieldPct || 1)) / portions : Number(ing.qty || 0);
        const needed = perServing * portionsToPrep;
        sum[ing.item_id] = (sum[ing.item_id] || 0) + needed;
      }
    }
    const list = Object.entries(sum).map(([itemId, qty]) => ({
      item: itemsById[itemId],
      qty,
    }));
    list.sort((a, b) => (a.item?.name || '').localeCompare(b.item?.name || ''));
    return list;
  }, [sel, recipes, ingByRecipe, itemsById]);

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Prep List</h1>
        <div className="flex gap-2">
          <button onClick={loadFromLastMenu} className="border rounded px-3 py-2">Load from last menu</button>
          <button disabled={saving} onClick={saveAsMenu} className="border rounded px-3 py-2">
            {saving ? "Saving…" : "Save as menu"}
          </button>
        </div>
      </div>

      {status && <div className="text-sm opacity-80">{status}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Picker */}
        <div className="border rounded p-4">
          <div className="font-semibold mb-2">Pick recipes to prep</div>
          {loading ? (
            <div className="text-sm text-neutral-400">Loading…</div>
          ) : (
            <div className="space-y-2 max-h-[60vh] overflow-auto pr-2">
              {recipes.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2 text-sm">
                  <span>{r.name}</span>
                  {sel[r.id] ? (
                    <button className="text-xs underline" onClick={() => removeRecipe(r.id)}>Remove</button>
                  ) : (
                    <button className="text-xs underline" onClick={() => addRecipe(r.id)}>Add</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Selected & quantities */}
        <div className="border rounded p-4">
          <div className="font-semibold mb-2">Quantities (portions to prep)</div>
          {Object.keys(sel).length === 0 ? (
            <p className="text-sm text-neutral-400">Add recipes on the left.</p>
          ) : (
            <div className="space-y-2">
              {Object.keys(sel).map((rid) => {
                const r = recipes.find(x => x.id === rid);
                if (!r) return null;
                return (
                  <div key={rid} className="grid grid-cols-6 gap-2 items-center">
                    <div className="col-span-4">
                      <div className="font-medium">{r.name}</div>
                      <div className="text-xs text-neutral-400">
                        Batch yield: {r.batch_yield_qty ?? 1} {r.batch_yield_unit || 'each'} • Yield%: {Math.round((r.yield_pct ?? 1) * 100)}%
                      </div>
                    </div>
                    <input
                      className="border rounded p-1 col-span-1 text-right"
                      type="number" min={0} step={1}
                      value={sel[rid]}
                      onChange={(e) => setQty(rid, Number(e.target.value))}
                    />
                    <button className="text-xs underline col-span-1 justify-self-end" onClick={() => removeRecipe(rid)}>Remove</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Aggregated list */}
      <div className="border rounded p-4">
        <div className="font-semibold mb-3">Ingredients to prep (total)</div>
        {totals.length === 0 ? (
          <p className="text-sm text-neutral-400">No items yet.</p>
        ) : (
          <table className="w-full text-sm table-auto border-separate border-spacing-y-1">
            <thead>
              <tr className="text-left text-neutral-300">
                <th className="px-3 py-2">Ingredient</th>
                <th className="px-3 py-2">Total Qty</th>
                <th className="px-3 py-2">Base Unit</th>
              </tr>
            </thead>
            <tbody>
              {totals.map((row, i) => (
                <tr key={i} className="bg-neutral-950/60 rounded">
                  <td className="px-3 py-2 rounded-l">{row.item?.name ?? '(missing)'}</td>
                  <td className="px-3 py-2">{(row.qty ?? 0).toFixed(3)}</td>
                  <td className="px-3 py-2 rounded-r">{row.item?.base_unit ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="text-xs opacity-70 mt-2">
          Quantities are in each item’s <em>base unit</em> using your inventory pack→base conversion and recipe yields.
        </p>
      </div>
    </div>
  );
}
