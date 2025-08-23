// src/components/MenuPageClient.tsx
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
type Sel = Record<string, number>;              // recipeId -> portions
type Overrides = Record<string, number | undefined>; // recipeId -> custom price

// simple “ends with .99 / .95 / .49 / none” rounding
const ROUND_CHOICES = ['.00', '.49', '.95', '.99'] as const;
type RoundMode = (typeof ROUND_CHOICES)[number];
function roundToEnding(n: number, mode: RoundMode): number {
  if (mode === '.00') return Math.round(n);
  const dollars = Math.floor(n);
  const target = Number(`${dollars}${mode}`);
  if (n <= target) return target;
  return Number(`${dollars + 1}${mode}`);
}

export default function MenuPageClient() {
  const [tenantId, setTenantId] = useState<string | null>(null);

  const [menus, setMenus] = useState<MenuRow[]>([]);
  const [selectedMenuId, setSelectedMenuId] = useState<string | null>(null);

  const [recipes, setRecipes] = useState<RecipeRow[]>([]);
  const [ingredients, setIngredients] = useState<IngredientLine[]>([]);
  const [itemCostById, setItemCostById] = useState<ItemCostById>({});

  const [sel, setSel] = useState<Sel>({});
  const [margin, setMargin] = useState(0.30); // food‑cost percent, default 30%
  const [roundMode, setRoundMode] = useState<RoundMode>('.99');
  const [overrides, setOverrides] = useState<Overrides>({}); // custom suggested price overrides

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

  // when a menu is selected, load its lines and any saved overrides (if you store them later)
  useEffect(() => {
    (async () => {
      if (!selectedMenuId) { setSel({}); setOverrides({}); return; }
      const { data: rows } = await supabase
        .from('menu_recipes')
        .select('recipe_id, servings, price')
        .eq('menu_id', selectedMenuId);

      const nextSel: Sel = {};
      const nextOverrides: Overrides = {};
      (rows ?? []).forEach(r => {
        nextSel[r.recipe_id] = Number(r.servings || 1);
        // if you later persist overrides in menu_recipes.price, bring it back:
        if (r.price && r.price > 0) nextOverrides[r.recipe_id] = Number(r.price);
      });
      setSel(nextSel);
      setOverrides(nextOverrides);
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
    setOverrides(o => {
      const c = { ...o };
      delete c[id];
      return c;
    });
  }
  function setQty(id: string, n: number) {
    setSel(s => ({ ...s, [id]: Math.max(0, Math.floor(n)) }));
  }
  function setOverride(id: string, n: number) {
    setOverrides(o => ({ ...o, [id]: Math.max(0, Number.isFinite(n) ? n : 0) }));
  }

  // Save current lines (and persist overrides into menu_recipes.price so they travel with the menu)
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
        price: Number(overrides[recipe_id] ?? 0) || 0, // store override if present
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
      setOverrides({});
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
        price: Number(overrides[recipe_id] ?? 0) || 0,
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
      setOverrides({});
      setStatus('Menu deleted.');
    } catch (err: any) {
      alert(err.message ?? 'Error deleting menu');
    } finally {
      setBusy(false);
    }
  }

  // Open Print/Share
  function openShare() {
    if (!selectedMenuId) { alert('No menu selected'); return; }
    const pct = Math.round(margin * 100);
    window.open(`/menu/print?menu_id=${selectedMenuId}&margin=${pct / 100}`, '_blank');
  }

  // Maps for quick lookups
  const ingByRecipe = useMemo(() => {
    const map = new Map<string, IngredientLine[]>();
    for (const ing of ingredients) {
      const rid = ing.recipe_id!;
      if (!map.has(rid)) map.set(rid, []);
      map.get(rid)!.push(ing);
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

      {/* Margin + Rounding */}
      <div className="flex items-center gap-3 flex-wrap">
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

        <div className="ml-4 flex items-center gap-2">
          <span className="text-sm">Round to:</span>
          <select
            className="border rounded px-2 py-1 bg-neutral-950"
            value={roundMode}
            onChange={(e) => setRoundMode(e.target.value as RoundMode)}
          >
            {ROUND_CHOICES.map(ch => <option key={ch} value={ch}>{ch}</option>)}
          </select>
        </div>
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

          {/* Column headers for the right panel */}
          <div className="grid grid-cols-8 gap-2 px-1 pb-2 text-xs uppercase opacity-70">
            <div className="col-span-5">Item</div>
            <div className="col-span-1 text-right">Qty</div>
            <div className="col-span-2 text-right">Suggested</div>
          </div>

          {selectedList.length === 0 ? (
            <p className="text-sm text-neutral-400">Add recipes on the left.</p>
          ) : (
            <div className="space-y-3">
              {selectedList.map(row => {
                const recipe = recipes.find(r => r.id === row.id)!;
                const parts = ingByRecipe.get(row.id) ?? [];
                const costEach = costPerPortion(recipe, parts, itemCostById);
                const computed = roundToEnding(priceFromCost(costEach, margin), roundMode);
                const current = overrides[row.id] ?? computed;

                return (
                  <div key={row.id} className="grid grid-cols-8 gap-2 items-center">
                    {/* Name + raw cost */}
                    <div className="col-span-5">
                      <div className="font-medium leading-tight">{row.name}</div>
                      <div className="text-xs opacity-70">{fmtUSD(costEach)} each (raw cost)</div>
                    </div>

                    {/* Qty - small box */}
                    <div className="col-span-1 justify-self-end">
                      <input
                        className="border rounded p-1 w-16 text-right tabular-nums"
                        type="number" min={0} step={1}
                        value={row.servings}
                        onChange={(e) => setQty(row.id, Number(e.target.value))}
                      />
                    </div>

                    {/* Suggested - larger box with $ prefix */}
                    <div className="col-span-2 justify-self-end">
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 opacity-60 select-none">$</span>
                        <input
                          className="border rounded p-1 pl-5 w-28 sm:w-32 text-right tabular-nums"
                          type="number" min={0} step={0.01}
                          value={Number(current.toFixed(2))}
                          onChange={(e) => setOverride(row.id, Number(e.target.value))}
                        />
                      </div>
                    </div>
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
                    const computed = roundToEnding(priceFromCost(costEach, margin), roundMode);
                    const current = overrides[row.id] ?? computed;
                    return sum + current * Number(row.servings || 0);
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
