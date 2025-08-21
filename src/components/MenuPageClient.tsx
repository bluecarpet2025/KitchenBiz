// src/components/MenuPageClient.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  costPerBaseUnit,
  costPerPortion,
  priceFromCost,
  type IngredientRow,
  type ItemCostRow,
  type Recipe as RecipeCostRecipe,
} from '@/lib/costing';

type MenuRow = { id: string; name: string | null; created_at: string | null };
type Recipe = {
  id: string;
  name: string | null;
  batch_yield_qty: number | null;
  batch_yield_unit: string | null;
  yield_pct: number | null;
};
type Sel = Record<string, number>; // recipeId -> portions

export default function MenuPageClient() {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [menus, setMenus] = useState<MenuRow[]>([]);
  const [selectedMenuId, setSelectedMenuId] = useState<string | null>(null);

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [sel, setSel] = useState<Sel>({});
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(null);

  // costing data
  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);
  const [itemCosts, setItemCosts] = useState<Record<string, number>>({});
  const [foodPct, setFoodPct] = useState<number>(() => {
    const raw = typeof window !== 'undefined' ? localStorage.getItem('foodPct') : null;
    const v = raw ? Number(raw) : 30;
    return Number.isFinite(v) ? v : 30;
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('foodPct', String(foodPct));
    }
  }, [foodPct]);

  // boot: get tenant, menus, recipes, costing sources
  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) { setStatus('Sign in required.'); return; }
      const { data: prof } = await supabase
        .from('profiles').select('tenant_id').eq('id', uid).maybeSingle();
      if (!prof?.tenant_id) { setStatus('No tenant.'); return; }
      setTenantId(prof.tenant_id);

      // Menus (order by created_at; no updated_at)
      const { data: ms } = await supabase
        .from('menus')
        .select('id,name,created_at')
        .eq('tenant_id', prof.tenant_id)
        .order('created_at', { ascending: false });
      const list = (ms ?? []) as MenuRow[];
      setMenus(list);
      setSelectedMenuId(list?.[0]?.id ?? null);

      // Recipes
      const { data: recs } = await supabase
        .from('recipes')
        .select('id,name,batch_yield_qty,batch_yield_unit,yield_pct')
        .eq('tenant_id', prof.tenant_id)
        .order('name');
      setRecipes((recs ?? []) as Recipe[]);

      // All recipe ingredients (for cost calc)
      const { data: ris } = await supabase
        .from('recipe_ingredients')
        .select('recipe_id,item_id,qty');
      setIngredients((ris ?? []) as IngredientRow[]);

      // Item costs
      const { data: items } = await supabase
        .from('inventory_items')
        .select('id,last_price,pack_to_base_factor')
        .eq('tenant_id', prof.tenant_id);
      const costMap: Record<string, number> = {};
      (items ?? []).forEach((it: ItemCostRow) => {
        costMap[it.id] = costPerBaseUnit(it.last_price, it.pack_to_base_factor);
      });
      setItemCosts(costMap);
    })();
  }, []);

  // when a menu is selected, load its lines + any share
  useEffect(() => {
    (async () => {
      if (!selectedMenuId) { setSel({}); setShareToken(null); return; }
      const { data: rows } = await supabase
        .from('menu_recipes')
        .select('recipe_id, servings')
        .eq('menu_id', selectedMenuId);

      const next: Sel = {};
      (rows ?? []).forEach(r => { next[r.recipe_id] = Number(r.servings || 1); });
      setSel(next);

      const { data: shares } = await supabase
        .from('menu_shares')
        .select('token')
        .eq('menu_id', selectedMenuId)
        .limit(1);
      setShareToken(shares?.[0]?.token ?? null);
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

  // New / Save / Save-as: unchanged (but kept here so your UI works)
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
      setShareToken(null);
      setStatus('Menu created.');
    } catch (err: any) {
      alert(err.message ?? 'Error creating menu');
    } finally {
      setBusy(false);
    }
  }

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
        price: 0
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
    } catch (err:any) {
      alert(err.message ?? 'Error saving menu');
    } finally {
      setBusy(false);
    }
  }

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
        price: 0
      }));
      const { error: rErr } = await supabase
        .from('menu_recipes')
        .upsert(rows, { onConflict: 'menu_id,recipe_id' });
      if (rErr) throw rErr;
      setMenus(ms => [{ id: newId, name: m!.name, created_at: m!.created_at }, ...ms]);
      setSelectedMenuId(newId);
      setShareToken(null);
      setStatus('Menu saved.');
    } catch (err:any) {
      alert(err.message ?? 'Error saving as new menu');
    } finally {
      setBusy(false);
    }
  }

  function doPrint() {
    if (!selectedMenuId) { alert('No menu selected'); return; }
    const pct = (foodPct || 30) / 100;
    window.open(`/menu/print?menu_id=${selectedMenuId}&pct=${pct}`, '_blank');
  }

  // ---- pricing calculations for right panel ----
  const foodPctDecimal = (foodPct || 30) / 100;

  const selectedList = useMemo(
    () =>
      Object.keys(sel)
        .map(id => ({
          id,
          servings: sel[id],
          name: recipes.find(r => r.id === id)?.name || 'Untitled',
          recipe: recipes.find(r => r.id === id) as RecipeCostRecipe | undefined,
          ings: ingredients.filter(ing => ing.recipe_id === id),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [sel, recipes, ingredients]
  );

  const pricedRows = useMemo(() => {
    return selectedList.map(row => {
      const c = row.recipe
        ? costPerPortion(row.recipe, row.ings, itemCosts)
        : 0;
      const unitPrice = priceFromCost(c, foodPctDecimal);
      const line = unitPrice * (row.servings || 0);
      return { ...row, costPerPortion: c, unitPrice, line };
    });
  }, [selectedList, itemCosts, foodPctDecimal]);

  const total = pricedRows.reduce((s, r) => s + r.line, 0);

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Menu</h1>
      {status && <p className="text-xs text-emerald-400">{status}</p>}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
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
        </div>

        <div className="flex items-center gap-4">
          {/* Food-cost slider */}
          <div className="flex items-center gap-2">
            <span className="text-sm">Food cost %</span>
            <input
              type="range"
              min={10}
              max={50}
              step={1}
              value={foodPct}
              onChange={(e) => setFoodPct(Number(e.target.value))}
            />
            <span className="text-sm tabular-nums w-10 text-right">{foodPct}%</span>
          </div>

          <button onClick={doPrint} className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">Print</button>
          {!shareToken ? (
            <button
              disabled={busy}
              onClick={async () => {
                try {
                  if (!selectedMenuId || !tenantId) return;
                  setBusy(true);
                  const token = crypto.randomUUID().replace(/-/g, '').slice(0, 24);
                  const payload = { menu_id: selectedMenuId, name: menus.find(m => m.id===selectedMenuId)?.name ?? 'Menu' };
                  const { error } = await supabase.from('menu_shares').insert({
                    token, tenant_id: tenantId, menu_id: selectedMenuId, payload
                  });
                  if (error) throw error;
                  setShareToken(token);
                  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://kitchenbiz.vercel.app';
                  await navigator.clipboard.writeText(`${origin}/share/${token}`).catch(()=>{});
                  setStatus('Public share link created & copied.');
                } finally { setBusy(false); }
              }}
              className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
            >
              Create share link
            </button>
          ) : (
            <button
              onClick={async () => {
                const origin = typeof window !== 'undefined'
                  ? window.location.origin : 'https://kitchenbiz.vercel.app';
                await navigator.clipboard.writeText(`${origin}/share/${shareToken}`).catch(() => {});
                setStatus('Share link copied.');
              }}
              className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
            >
              Copy share
            </button>
          )}
        </div>
      </div>

      {/* Two panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

        <div className="border rounded p-4">
          <div className="font-semibold mb-2">Quantities & Pricing</div>
          {pricedRows.length === 0 ? (
            <p className="text-sm text-neutral-400">Add recipes on the left.</p>
          ) : (
            <div className="space-y-2">
              {pricedRows.map(row => (
                <div key={row.id} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-5">
                    <div className="font-medium">{row.name}</div>
                    <div className="text-xs opacity-70">
                      Cost/portion ${row.costPerPortion.toFixed(2)} • Price ${row.unitPrice.toFixed(2)}
                    </div>
                  </div>
                  <input
                    className="border rounded p-1 col-span-2 text-right"
                    type="number" min={0} step={1}
                    value={sel[row.id]}
                    onChange={(e) => setQty(row.id, Number(e.target.value))}
                  />
                  <div className="col-span-3 text-right tabular-nums">${row.line.toFixed(2)}</div>
                  <button className="text-xs underline col-span-2 justify-self-end" onClick={() => removeRecipe(row.id)}>Remove</button>
                </div>
              ))}
              <div className="pt-2 border-t text-right font-semibold">Total ${total.toFixed(2)}</div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
