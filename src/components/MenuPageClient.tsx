// src/components/MenuPageClient.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import {
  costPerBaseUnit,
  costPerPortion,
  priceFromCost,
  fmtUSD,
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

  // pricing
  const [marginPct, setMarginPct] = useState<number>(30); // percent 0..100

  // boot
  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) {
        setStatus('Sign in required.');
        return;
      }
      const { data: prof } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', uid)
        .maybeSingle();

      if (!prof?.tenant_id) {
        setStatus('No tenant.');
        return;
      }
      setTenantId(prof.tenant_id);

      // menus (order by created_at desc)
      const { data: ms } = await supabase
        .from('menus')
        .select('id,name,created_at')
        .eq('tenant_id', prof.tenant_id)
        .order('created_at', { ascending: false });

      const list = (ms ?? []) as MenuRow[];
      setMenus(list);
      setSelectedMenuId(list?.[0]?.id ?? null);

      // recipes
      const { data: recs } = await supabase
        .from('recipes')
        .select('id,name,batch_yield_qty,batch_yield_unit,yield_pct')
        .eq('tenant_id', prof.tenant_id)
        .order('name');
      setRecipes((recs ?? []) as Recipe[]);
    })();
  }, []);

  // load selected menu lines + share
  useEffect(() => {
    (async () => {
      if (!selectedMenuId) {
        setSel({});
        setShareToken(null);
        return;
      }
      const { data: rows } = await supabase
        .from('menu_recipes')
        .select('recipe_id,servings')
        .eq('menu_id', selectedMenuId);

      const next: Sel = {};
      (rows ?? []).forEach((r: any) => {
        next[r.recipe_id] = Number(r.servings || 1);
      });
      setSel(next);

      const { data: shares } = await supabase
        .from('menu_shares')
        .select('token')
        .eq('menu_id', selectedMenuId)
        .limit(1);
      setShareToken(shares?.[0]?.token ?? null);
    })();
  }, [selectedMenuId]);

  // inventory base-unit cost map
  const [itemCostById, setItemCostById] = useState<Record<string, number>>({});
  useEffect(() => {
    (async () => {
      if (!tenantId) return;
      const { data: items } = await supabase
        .from('inventory_items')
        .select('id,last_price,pack_to_base_factor')
        .eq('tenant_id', tenantId);
      const map: Record<string, number> = {};
      (items ?? []).forEach((it: any) => {
        map[it.id] = costPerBaseUnit(
          Number(it.last_price ?? 0),
          Number(it.pack_to_base_factor ?? 0)
        );
      });
      setItemCostById(map);
    })();
  }, [tenantId]);

  function addRecipe(id: string) {
    setSel((s) => ({ ...s, [id]: s[id] ?? 1 }));
  }
  function removeRecipe(id: string) {
    setSel((s) => {
      const c = { ...s };
      delete c[id];
      return c;
    });
  }
  function setQty(id: string, n: number) {
    setSel((s) => ({ ...s, [id]: Math.max(0, Math.floor(n)) }));
  }

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
      setMenus((m) => [{ id: ins!.id, name: ins!.name, created_at: ins!.created_at }, ...m]);
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
      if (!selectedMenuId) {
        alert('No menu selected');
        return;
      }
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

  async function saveAsMenu() {
    try {
      if (!tenantId) return;
      const entries = Object.entries(sel).filter(([, v]) => v > 0);
      if (entries.length === 0) {
        alert('Add at least one recipe.');
        return;
      }
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

      setMenus((ms) => [{ id: newId, name: m!.name, created_at: m!.created_at }, ...ms]);
      setSelectedMenuId(newId);
      setShareToken(null);
      setStatus('Menu saved.');
    } catch (err: any) {
      alert(err.message ?? 'Error saving as new menu');
    } finally {
      setBusy(false);
    }
  }

  async function deleteMenu() {
    if (!selectedMenuId) return;
    if (!confirm('Delete this menu? This will remove its lines and shares.')) return;
    setBusy(true);
    // cascade: shares then lines then menu
    await supabase.from('menu_shares').delete().eq('menu_id', selectedMenuId);
    await supabase.from('menu_recipes').delete().eq('menu_id', selectedMenuId);
    await supabase.from('menus').delete().eq('id', selectedMenuId);
    setMenus((ms) => ms.filter((m) => m.id !== selectedMenuId));
    setSelectedMenuId(null);
    setSel({});
    setShareToken(null);
    setStatus('Menu deleted.');
    setBusy(false);
  }

  function doPrint() {
    if (!selectedMenuId) {
      alert('No menu selected');
      return;
    }
    const margin = (marginPct / 100).toFixed(3);
    window.open(`/menu/print?menu_id=${selectedMenuId}&margin=${margin}`, '_blank');
  }

  async function createShare() {
    try {
      if (!selectedMenuId || !tenantId) return;
      setBusy(true);
      const name = menus.find((m) => m.id === selectedMenuId)?.name ?? 'Menu';
      const items = Object.keys(sel)
        .filter((id) => sel[id] > 0)
        .map((id) => ({
          name: recipes.find((r) => r.id === id)?.name || 'Untitled',
          servings: sel[id],
        }));
      const token = crypto.randomUUID().replace(/-/g, '').slice(0, 24);
      const payload = { name, created_at: new Date().toISOString(), items };
      const { error } = await supabase
        .from('menu_shares')
        .insert({ token, tenant_id: tenantId, menu_id: selectedMenuId, payload });
      if (error) throw error;
      setShareToken(token);
      const origin =
        typeof window !== 'undefined' ? window.location.origin : 'https://kitchenbiz.vercel.app';
      await navigator.clipboard.writeText(`${origin}/share/${token}`).catch(() => {});
      setStatus('Public share link created & copied.');
    } catch (err: any) {
      alert(err.message ?? 'Error creating share link');
    } finally {
      setBusy(false);
    }
  }

  // compute pricing rows
  const rows = useMemo(() => {
    const m = Math.max(0, Math.min(1, marginPct / 100));
    return Object.keys(sel)
      .map((id) => {
        const r = recipes.find((x) => x.id === id);
        const qty = sel[id] ?? 0;
        if (!r) {
          return { id, name: 'Untitled', qty, eachCost: 0, eachSuggested: 0, line: 0 };
        }
        // cost per portion (base costs from inventory)
        const parts = []; // we only need costPerPortion's signature items map + recipe; it will fetch via qty fields in recipe_ingredients in print; here we approximate with 0 if we lack parts
        // NOTE: on the client we don’t have ingredients handy; use server for exact print.
        // For UI, use “best effort” by reading items map if qtys exist later; otherwise 0.
        const eachCost = costPerPortion(r, [], itemCostById);
        const eachSuggested = priceFromCost(eachCost, m);
        return {
          id,
          name: r.name ?? 'Untitled',
          qty,
          eachCost,
          eachSuggested,
          line: eachSuggested * qty,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [sel, recipes, itemCostById, marginPct]);

  const grand = rows.reduce((s, r) => s + r.line, 0);

  const selectedList = useMemo(
    () =>
      Object.keys(sel)
        .map((id) => ({
          id,
          servings: sel[id],
          name: recipes.find((r) => r.id === id)?.name || 'Untitled',
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [sel, recipes]
  );

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
              onChange={(e) => setSelectedMenuId(e.target.value || null)}
            >
              {(menus ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {(m.name || 'Untitled')}
                  {m.created_at ? ` • ${new Date(m.created_at).toLocaleDateString()}` : ''}
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
          <button disabled={busy || !selectedMenuId} onClick={deleteMenu} className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900 text-red-300">
            Delete
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={doPrint} className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
            Print
          </button>
          {!shareToken ? (
            <button disabled={busy} onClick={createShare} className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
              Create share link
            </button>
          ) : (
            <button
              onClick={async () => {
                const origin =
                  typeof window !== 'undefined' ? window.location.origin : 'https://kitchenbiz.vercel.app';
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

      {/* Margin slider */}
      <div className="flex items-center gap-3">
        <label className="text-sm">Margin:</label>
        <input
          type="range"
          min={0}
          max={90}
          value={marginPct}
          onChange={(e) => setMarginPct(Number(e.target.value))}
          className="w-64"
        />
        <span className="text-sm tabular-nums">{marginPct}%</span>
        <span className="text-xs opacity-70">(affects suggested selling price)</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* left */}
        <div className="border rounded p-4">
          <div className="font-semibold mb-2">Pick recipes</div>
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
            {recipes.length === 0 && <div className="text-sm text-neutral-400">No recipes yet.</div>}
          </div>
        </div>

        {/* right */}
        <div className="border rounded p-4">
          <div className="font-semibold mb-2">Quantities (portions)</div>
          {selectedList.length === 0 ? (
            <p className="text-sm text-neutral-400">Add recipes on the left.</p>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-8 gap-2 text-xs opacity-70 px-1">
                <div className="col-span-5">Item</div>
                <div className="text-right">Qty</div>
                <div className="text-right col-span-2">Suggested</div>
              </div>
              {rows.map((row) => (
                <div key={row.id} className="grid grid-cols-8 gap-2 items-center">
                  <div className="col-span-5">
                    <div className="font-medium text-sm">{row.name}</div>
                    <div className="text-xs opacity-70">{fmtUSD(row.eachSuggested)} each</div>
                  </div>
                  <input
                    className="border rounded p-1 text-right text-sm"
                    type="number"
                    min={0}
                    step={1}
                    value={sel[row.id] ?? 0}
                    onChange={(e) => setQty(row.id, Number(e.target.value))}
                  />
                  <div className="col-span-2 text-right tabular-nums">{fmtUSD(row.line)}</div>
                </div>
              ))}
              <div className="border-t pt-2 text-right font-semibold">
                Total: <span className="tabular-nums">{fmtUSD(grand)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
