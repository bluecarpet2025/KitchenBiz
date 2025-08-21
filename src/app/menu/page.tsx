'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { costPerServing, fmtUSD, suggestedPrice } from '@/lib/costing';

type MenuRow = { id: string; name: string | null; created_at: string | null };
type Recipe = {
  id: string;
  name: string | null;
  batch_yield_qty: number | null;
  batch_yield_unit: string | null;
  yield_pct: number | null;
};
type IngredientRow = { recipe_id: string; item_id: string; qty: number | null };
type ItemRow = { id: string; name: string | null; last_price: number | null; pack_to_base_factor: number | null };
type Sel = Record<string, number>; // recipeId -> portions

export default function MenuBuilder() {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [menus, setMenus] = useState<MenuRow[]>([]);
  const [selectedMenuId, setSelectedMenuId] = useState<string | null>(null);

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);
  const [itemsById, setItemsById] = useState<Record<string, ItemRow>>({});

  const [sel, setSel] = useState<Sel>({});
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(null);

  const [targetPct, setTargetPct] = useState<number>(() => {
    const saved = localStorage.getItem('targetFoodPct');
    return saved ? Number(saved) : 0.30;
  });
  useEffect(() => {
    localStorage.setItem('targetFoodPct', String(targetPct));
  }, [targetPct]);

  // boot: tenant, menus, recipes, ingredients, items
  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) { setStatus('Sign in required.'); return; }

      const { data: prof } = await supabase.from('profiles').select('tenant_id').eq('id', uid).maybeSingle();
      if (!prof?.tenant_id) { setStatus('No tenant.'); return; }
      setTenantId(prof.tenant_id);

      const { data: ms } = await supabase
        .from('menus').select('id,name,created_at')
        .eq('tenant_id', prof.tenant_id)
        .order('created_at', { ascending: false });
      const list = (ms ?? []) as MenuRow[];
      setMenus(list);
      setSelectedMenuId(list?.[0]?.id ?? null);

      const { data: recs } = await supabase
        .from('recipes')
        .select('id,name,batch_yield_qty,batch_yield_unit,yield_pct')
        .eq('tenant_id', prof.tenant_id)
        .order('name');
      const rList = (recs ?? []) as Recipe[];
      setRecipes(rList);

      // ingredients for all recipes
      const rids = rList.map(r => r.id);
      const { data: ing } = await supabase
        .from('recipe_ingredients')
        .select('recipe_id,item_id,qty')
        .in('recipe_id', rids);
      const ingList = (ing ?? []) as IngredientRow[];
      setIngredients(ingList);

      // items referenced
      const itemIds = Array.from(new Set(ingList.map(i => i.item_id)));
      if (itemIds.length) {
        const { data: items } = await supabase
          .from('inventory_items')
          .select('id,name,last_price,pack_to_base_factor')
          .in('id', itemIds);
        const map: Record<string, ItemRow> = {};
        (items ?? []).forEach((it: any) => { map[it.id] = it as ItemRow; });
        setItemsById(map);
      }
    })();
  }, []);

  // when a menu is selected, load its lines + share
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

  // helpers
  const ingByRecipe = useMemo(() => {
    const m = new Map<string, IngredientRow[]>();
    for (const row of ingredients) {
      if (!m.has(row.recipe_id)) m.set(row.recipe_id, []);
      m.get(row.recipe_id)!.push(row);
    }
    return m;
  }, [ingredients]);

  const pricedSelection = useMemo(() => {
    // list for right panel with calculated price per item (using targetPct)
    const list = Object.keys(sel).map((rid) => {
      const rec = recipes.find(r => r.id === rid);
      const parts = ingByRecipe.get(rid) ?? [];
      const cps = costPerServing({ recipe: rec, ingredients: parts, itemsById });
      const priceEach = suggestedPrice(cps, targetPct);
      return {
        id: rid,
        name: rec?.name ?? 'Untitled',
        portions: sel[rid],
        priceEach,
        lineTotal: priceEach * Math.max(0, sel[rid] || 0),
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
    const grand = list.reduce((s, r) => s + r.lineTotal, 0);
    return { list, grand };
  }, [sel, recipes, ingByRecipe, itemsById, targetPct]);

  // New menu
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

  // Save current (UPSERT with computed price)
  async function saveCurrentMenu() {
    try {
      if (!selectedMenuId) { alert('No menu selected'); return; }
      setBusy(true);

      const dedup = Object.entries(sel).filter(([, v]) => v > 0)
        .reduce((m, [id, qty]) => (m.set(id, qty), m), new Map<string, number>());

      const rows = Array.from(dedup.entries()).map(([recipe_id, servings]) => {
        const rec = recipes.find(r => r.id === recipe_id);
        const parts = ingByRecipe.get(recipe_id) ?? [];
        const cps = costPerServing({ recipe: rec, ingredients: parts, itemsById });
        const price = suggestedPrice(cps, targetPct);
        return { menu_id: selectedMenuId!, recipe_id, servings: Number(servings), price: Number(price.toFixed(2)) };
      });

      if (rows.length) {
        const { error } = await supabase
          .from('menu_recipes')
          .upsert(rows, { onConflict: 'menu_id,recipe_id' });
        if (error) throw error;
      } else {
        await supabase.from('menu_recipes').delete().eq('menu_id', selectedMenuId!);
      }

      setStatus('Menu saved.');
      if (tenantId) {
        const { data: ms } = await supabase
          .from('menus')
          .select('id,name,created_at')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false });
        setMenus((ms ?? []) as MenuRow[]);
      }
    } catch (err: any) {
      alert(err.message ?? 'Error saving menu');
    } finally {
      setBusy(false);
    }
  }

  // “Save as”
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
      const rows = entries.map(([recipe_id, servings]) => {
        const rec = recipes.find(r => r.id === recipe_id);
        const parts = ingByRecipe.get(recipe_id) ?? [];
        const cps = costPerServing({ recipe: rec, ingredients: parts, itemsById });
        const price = suggestedPrice(cps, targetPct);
        return { menu_id: newId, recipe_id, servings: Number(servings), price: Number(price.toFixed(2)) };
      });

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
    window.open(`/menu/print?menu_id=${selectedMenuId}`, '_blank');
  }

  async function createShare() {
    try {
      if (!selectedMenuId || !tenantId) return;
      setBusy(true);

      // Persist current prices first (to ensure share reflects them)
      await saveCurrentMenu();

      const token = crypto.randomUUID().replace(/-/g, '').slice(0, 24);
      const payload = { menu_id: selectedMenuId, name: menus.find(m => m.id===selectedMenuId)?.name ?? 'Menu' };

      const { error } = await supabase.from('menu_shares').insert({
        token, tenant_id: tenantId, menu_id: selectedMenuId, payload
      });
      if (error) throw error;

      setShareToken(token);
      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://kitchenbiz.vercel.app';
      await navigator.clipboard.writeText(`${origin}/share/${token}`).catch(() => {});
      setStatus('Public share link created & copied.');
    } catch (err:any) {
      alert(err.message ?? 'Error creating share link');
    } finally {
      setBusy(false);
    }
  }

  const { list: selList, grand } = pricedSelection;

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Menu</h1>
      {status && <p className="text-xs text-emerald-400">{status}</p>}

      {/* Actions row */}
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

        <div className="flex items-center gap-2">
          <button onClick={doPrint} className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">Print</button>
          {!shareToken ? (
            <button disabled={busy} onClick={createShare} className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
              Create share link
            </button>
          ) : (
            <button
              onClick={async () => {
                const origin = typeof window !== 'undefined' ? window.location.origin : 'https://kitchenbiz.vercel.app';
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

      {/* Pricing control for menu */}
      <div className="border rounded-lg p-3 flex items-center gap-4">
        <div className="font-medium">Target food cost %</div>
        <input
          type="range"
          min={0.20}
          max={0.45}
          step={0.01}
          value={targetPct}
          onChange={(e) => setTargetPct(Number(e.target.value))}
          className="w-48"
        />
        <div className="tabular-nums">{Math.round(targetPct * 100)}%</div>
        <div className="text-sm opacity-70">Line price = cost/serving ÷ target%</div>
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
          <div className="font-semibold mb-2">Menu pricing</div>
          {selList.length === 0 ? (
            <p className="text-sm text-neutral-400">Add recipes on the left.</p>
          ) : (
            <div className="space-y-2">
              {selList.map(row => (
                <div key={row.id} className="grid grid-cols-7 gap-2 items-center">
                  <div className="col-span-3">
                    <div className="font-medium">{row.name}</div>
                  </div>
                  <input
                    className="border rounded p-1 col-span-1 text-right"
                    type="number" min={0} step={1}
                    value={sel[row.id]}
                    onChange={(e) => setQty(row.id, Number(e.target.value))}
                  />
                  <div className="col-span-1 text-right tabular-nums">{fmtUSD(row.priceEach)}</div>
                  <div className="col-span-1 text-right tabular-nums">{fmtUSD(row.lineTotal)}</div>
                  <button className="text-xs underline col-span-1 justify-self-end" onClick={() => removeRecipe(row.id)}>Remove</button>
                </div>
              ))}
              <div className="pt-2 mt-2 border-t flex justify-end">
                <div className="text-right">
                  <div className="text-sm opacity-70">Menu total</div>
                  <div className="text-lg font-semibold tabular-nums">{fmtUSD(grand)}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
