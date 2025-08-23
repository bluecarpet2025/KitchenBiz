'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import {
  fmtUSD,
  costPerBaseUnit,
  costPerPortion,
  priceFromCost,
  type ItemCostById,
  type RecipeLike,
  type IngredientLine,
} from '@/lib/costing';

type MenuRow = { id: string; name: string | null; created_at: string | null };

type RecipeRow = RecipeLike;

type Sel = Record<string, number>; // recipeId -> portions

export default function MenuPageClient() {
  const [tenantId, setTenantId] = useState<string | null>(null);

  const [menus, setMenus] = useState<MenuRow[]>([]);
  const [selectedMenuId, setSelectedMenuId] = useState<string | null>(null);

  const [recipes, setRecipes] = useState<RecipeRow[]>([]);
  const [ingredients, setIngredients] = useState<IngredientLine[]>([]);
  const [itemCostById, setItemCostById] = useState<ItemCostById>({});

  const [sel, setSel] = useState<Sel>({});
  const [margin, setMargin] = useState(0.30); // this is **food‑cost percent**, 30% default

  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // boot: auth + tenant + lists
  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) { setStatus('Sign in required.'); return; }

      const { data: prof } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', uid)
        .maybeSingle();

      const tId = prof?.tenant_id ?? null;
      if (!tId) { setStatus('No tenant.'); return; }
      setTenantId(tId);

      // Menus
      const { data: ms } = await supabase
        .from('menus')
        .select('id,name,created_at')
        .eq('tenant_id', tId)
        .order('created_at', { ascending: false });
      const list = (ms ?? []) as MenuRow[];
      setMenus(list);
      setSelectedMenuId(list?.[0]?.id ?? null);

      // Recipes
      const { data: recs } = await supabase
        .from('recipes')
        .select('id,name,batch_yield_qty,batch_yield_unit,yield_pct,menu_description')
        .eq('tenant_id', tId)
        .order('name');
      setRecipes((recs ?? []) as RecipeRow[]);

      // Ingredients for all recipes
      const { data: ing } = await supabase
        .from('recipe_ingredients')
        .select('recipe_id,item_id,qty')
        .eq('tenant_id', tId);
      setIngredients((ing ?? []) as IngredientLine[]);

      // Inventory item costs
      const { data: items } = await supabase
        .from('inventory_items')
        .select('id,last_price,pack_to_base_factor')
        .eq('tenant_id', tId);

      const costMap: ItemCostById = {};
      (items ?? []).forEach((it: any) => {
        costMap[it.id] = costPerBaseUnit(
          Number(it.last_price ?? 0),
          Number(it.pack_to_base_factor ?? 0)
        );
      });
      setItemCostById(costMap);
    })();
  }, []);

  // when a menu is selected, load its lines
  useEffect(() => {
    (async () => {
      if (!selectedMenuId) { setSel({}); return; }
      const { data: rows } = await supabase
        .from('menu_recipes')
        .select('recipe_id, servings')
        .eq('menu_id', selectedMenuId);

      const next: Sel = {};
      (rows ?? []).forEach(r => { next[r.recipe_id] = Number(r.servings || 1); });
      setSel(next);
    })();
  }, [selectedMenuId]);

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

  // Save current lines
  async function saveCurrentMenu() {
    try {
      if (!selectedMenuId) { alert('No menu selected'); return; }
      setBusy(true);

      const entries = Object.entries(sel)
        .filter(([, v]) => v > 0)
        .reduce((acc, [rid, servings]) => (acc.set(rid, servings), acc), new Map<string, number>());

      const rows = Array.from(entries.entries()).map(([recipe_id, servings]) => ({
        menu_id: selectedMenuId!,
        recipe_id,
        servings: Number(servings),
        price: 0,
      }));

      if (rows.length) {
        const { error } = await supabase
          .from('menu_recipes')
          .upsert(rows, { onConflict: 'menu_id,recipe_id' });
        if (error) throw error;
      } else {
        await supabase.from('menu_recipes').delete().eq('menu_id', selectedMenuId!);
      }

      setStatus('Menu saved.');
    } catch (err: any) {
      alert(err.message ?? 'Error saving menu');
    } finally {
      setBusy(false);
    }
  }

  // New
  async function createNewMenu() {
    try {
      if (!tenantId) return;
      setBusy(true);
      const name = window.prompt('Menu name:', 'New Menu');
      if (!name) return;

      const { data: ins, error } = await supabase
        .from('menus')
        .insert({ tenant_id: tenantId, name })
        .select('id, name, created_at')
        .single();
      if (error) throw error;

      setMenus(m => [{ id: ins!.id, name: ins!.name, created_at: ins!.created_at }, ...m]);
      setSelectedMenuId(ins!.id);
      setSel({});
      setStatus('Menu created.');
    } catch (err: any) {
      alert(err.message ?? 'Error creating menu');
    } finally {
      setBusy(false);
    }
  }

  // Save as
  async function saveAsMenu() {
    try {
      if (!tenantId) return;
      const entries = Object.entries(sel).filter(([, v]) => v > 0);
      if (entries.length === 0) { alert('Add at least one recipe.'); return; }

      setBusy(true);
      const defaultName = `Menu ${new Date().toLocaleDateString()}`;
      const name = window.prompt('New menu name:', defaultName);
      if (!name) return;

      const { data: m, error: mErr } = await supabase
        .from('menus')
        .insert({ tenant_id: tenantId, name })
        .select('id, name, created_at')
        .single();
      if (mErr) throw mErr;

      const newId = m!.id as string;
      const rows = entries.map(([recipe_id, servings]) => ({
        menu_id: newId,
        recipe_id,
        servings: Number(servings),
        price: 0,
      }));

      const { error: rErr } = await supabase
        .from('menu_recipes')
        .upsert(rows, { onConflict: 'menu_id,recipe_id' });
      if (rErr) throw rErr;

      setMenus(ms => [{ id: newId, name: m!.name, created_at: m!.created_at }, ...ms]);
      setSelectedMenuId(newId);
      setStatus('Menu saved.');
    } catch (err: any) {
      alert(err.message ?? 'Error saving as new menu');
    } finally {
      setBusy(false);
    }
  }

  // Delete current
  async function deleteCurrentMenu() {
    try {
      if (!selectedMenuId || !confirm('Delete this menu?')) return;
      setBusy(true);
      await supabase.from('menus').delete().eq('id', selectedMenuId);
      setMenus(ms => ms.filter(m => m.id !== selectedMenuId));
      setSelectedMenuId(menus?.[0]?.id ?? null);
      setSel({});
      setStatus('Menu deleted.');
    } catch (err: any) {
      alert(err.message ?? 'Error deleting menu');
    } finally {
      setBusy(false);
    }
  }

  // Open “Share” (replaces separate Print/Share buttons)
  function openShare() {
    if (!selectedMenuId) { alert('No menu selected'); return; }
    const pct = Math.round(margin * 100);
    window.open(`/menu/print?menu_id=${selectedMenuId}&margin=${pct / 100}`, '_blank');
  }

  // Maps for quick lookups
  const ingByRecipe = useMemo(() => {
    const map = new Map<string, IngredientLine[]>();
    for (const ing of ingredients) {
      if (!map.has(ing.recipe_id!)) map.set(ing.recipe_id!, []);
      map.get(ing.recipe_id!)!.push(ing);
    }
    return map;
  }, [ingredients]);

  const selectedList = useMemo(
    () =>
      Object.keys(sel)
        .map(id => ({
          id,
          servings: sel[id],
          name: recipes.find(r => r.id === id)?.name || 'Untitled'
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [sel, recipes]
  );

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Menu</h1>
      {status && <p className="text-xs text-emerald-400">{status}</p>}

      {/* Actions */}
      <div className="flex items-center gap-2 flex-wrap">
        <form onSubmit={(e) => e.preventDefault()} className="flex items-center gap-2">
          <label className="text-sm">Saved menus:</label>
          <select
            className="border rounded-md px-2 py-2 bg-neutral-950 text-neutral-100"
            value={selectedMenuId ?? ''}
            onChange={e => setSelectedMenuId(e.target.value || null)}
          >
            {(menus ?? []).map(m => (
              <option key={m.id} value={m.id}>
                {(m.name || 'Untitled')}{m.created_at ? ` • ${new Date(m.created_at).toLocaleDateString()}` : ''}
              </option>
            ))}
            {(!menus || menus.length === 0) && <option value="">(no menus yet)</option>}
          </select>
          <button className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">Load</button>
        </form>

        <button disabled={busy} onClick={createNewMenu} className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
          New Menu
        </button>
        <button disabled={busy} onClick={saveCurrentMenu} className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
          Save
        </button>
        <button disabled={busy} onClick={saveAsMenu} className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
          Save as
        </button>
        <button disabled={busy} onClick={deleteCurrentMenu} className="px-3 py-2 border rounded-md text-sm hover:bg-red-950">
          Delete
        </button>
        <button onClick={openShare} className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
          Share
        </button>
      </div>

      {/* Food‑cost slider (drives suggested price) */}
      <div className="flex items-center gap-3">
        <label className="text-sm">Margin:</label>
        <input
          type="range"
          min={5}
          max={95}
          value={Math.round(margin * 100)}
          onChange={(e) => setMargin(Number(e.target.value) / 100)}
        />
        <span className="text-sm">{Math.round(margin * 100)}%</span>
        <span className="text-xs opacity-70">(affects suggested selling price)</span>
      </div>

      {/* Two panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Pick list */}
        <div className="border rounded p-4">
          <div className="font-semibold mb-2">Pick recipes</div>
          <div className="space-y-2 max-h-[60vh] overflow-auto pr-2">
            {recipes.map(r => (
              <div key={r.id} className="flex items-center justify-between gap-2 text-sm">
                <span>{r.name}</span>
                {sel[r.id] ? (
                  <button className="text-xs underline" onClick={() => removeRecipe(r.id)}>Remove</button>
                ) : (
                  <button className="text-xs underline" onClick={() => addRecipe(r.id)}>Add</button>
                )}
              </div>
            ))}
            {recipes.length === 0 && <div className="text-sm text-neutral-400">No recipes yet.</div>}
          </div>
        </div>

        {/* Quantities */}
        <div className="border rounded p-4">
          <div className="font-semibold mb-2">Quantities (portions)</div>
          {selectedList.length === 0 ? (
            <p className="text-sm text-neutral-400">Add recipes on the left.</p>
          ) : (
            <div className="space-y-3">
              {selectedList.map(row => {
                const recipe = recipes.find(r => r.id === row.id)!;
                const parts = ingByRecipe.get(row.id) ?? [];
                const costEach = costPerPortion(recipe, parts, itemCostById);
                const suggested = priceFromCost(costEach, margin);
                return (
                  <div key={row.id} className="grid grid-cols-8 gap-2 items-center">
                    <div className="col-span-5">
                      <div className="font-medium">{row.name}</div>
                      <div className="text-xs opacity-70">{fmtUSD(costEach)} each (raw cost)</div>
                    </div>
                    <input
                      className="border rounded p-1 col-span-2 text-right"
                      type="number" min={0} step={1}
                      value={row.servings}
                      onChange={(e) => setQty(row.id, Number(e.target.value))}
                    />
                    <div className="col-span-1 text-right tabular-nums">{fmtUSD(suggested)}</div>
                  </div>
                );
              })}
              {/* Total suggested */}
              <div className="mt-4 text-right font-semibold">
                Total: {
                  fmtUSD(selectedList.reduce((sum, row) => {
                    const recipe = recipes.find(r => r.id === row.id)!;
                    const parts = ingByRecipe.get(row.id) ?? [];
                    const costEach = costPerPortion(recipe, parts, itemCostById);
                    const suggested = priceFromCost(costEach, margin);
                    return sum + suggested * Number(row.servings || 0);
                  }, 0))
                }
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
