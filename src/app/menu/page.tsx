'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

type MenuRow = { id: string; name: string | null; updated_at: string | null };
type Recipe = {
  id: string;
  name: string | null;
  batch_yield_qty: number | null;
  batch_yield_unit: string | null;
  yield_pct: number | null;
};
type Sel = Record<string, number>; // recipeId -> portions

export default function MenuBuilder() {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [menus, setMenus] = useState<MenuRow[]>([]);
  const [selectedMenuId, setSelectedMenuId] = useState<string | null>(null);

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [sel, setSel] = useState<Sel>({});
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [shareToken, setShareToken] = useState<string | null>(null);

  // bootstrap tenant, menus, recipes
  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) { setStatus('Sign in required.'); return; }
      const { data: prof } = await supabase.from('profiles').select('tenant_id').eq('id', uid).maybeSingle();
      if (!prof?.tenant_id) { setStatus('No tenant. Visit /app.'); return; }
      setTenantId(prof.tenant_id);

      const { data: ms } = await supabase
        .from('menus')
        .select('id,name,updated_at')
        .eq('tenant_id', prof.tenant_id)
        .order('updated_at', { ascending: false });
      setMenus((ms ?? []) as MenuRow[]);
      setSelectedMenuId(ms?.[0]?.id ?? null);

      const { data: recs } = await supabase
        .from('recipes')
        .select('id,name,batch_yield_qty,batch_yield_unit,yield_pct')
        .eq('tenant_id', prof.tenant_id)
        .order('name');
      setRecipes((recs ?? []) as Recipe[]);
    })();
  }, []);

  // load menu lines + existing share when selection changes
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
    setSel(s => { const c = { ...s }; delete c[id]; return c; });
  }
  function setQty(id: string, n: number) {
    setSel(s => ({ ...s, [id]: Math.max(0, Math.floor(n)) }));
  }

  async function handleLoad(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedMenuId) return;
    // no-op; the effect above already reacts to selectedMenuId
    setStatus('Menu loaded.');
  }

  async function createNewMenu() {
    try {
      if (!tenantId) return;
      setBusy(true);
      const name = window.prompt('Menu name:', `New Menu • ${new Date().toLocaleDateString()}`);
      if (!name) return;

      const { data: ins, error } = await supabase
        .from('menus')
        .insert({ tenant_id: tenantId, name })
        .select('id')
        .single();
      if (error) throw error;

      setMenus(m => [{ id: ins!.id, name, updated_at: new Date().toISOString() }, ...m]);
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

      const entries = Object.entries(sel).filter(([, v]) => v > 0);

      // clear and re-insert (simple, avoids diffing)
      await supabase.from('menu_recipes').delete().eq('menu_id', selectedMenuId);

      if (entries.length) {
        // NOTE: price is NOT NULL in your schema; set to 0 for now
        const rows = entries.map(([recipe_id, servings]) => ({
          menu_id: selectedMenuId,
          recipe_id,
          servings: Number(servings),
          price: 0,
        }));
        const { error } = await supabase.from('menu_recipes').insert(rows);
        if (error) throw error;
      }

      await supabase.from('menus').update({ updated_at: new Date().toISOString() }).eq('id', selectedMenuId);

      // refresh order in dropdown
      const { data: ms } = await supabase
        .from('menus')
        .select('id,name,updated_at')
        .eq('tenant_id', tenantId)
        .order('updated_at', { ascending: false });
      setMenus((ms ?? []) as MenuRow[]);

      setStatus('Menu saved.');
    } catch (err: any) {
      alert(err.message ?? 'Error saving menu');
    } finally {
      setBusy(false);
    }
  }

  async function saveAsNewMenu() {
    try {
      if (!tenantId) return;
      const entries = Object.entries(sel).filter(([, v]) => v > 0);
      if (entries.length === 0) { alert('Add at least one recipe.'); return; }

      setBusy(true);
      const defaultName = `Menu ${new Date().toLocaleDateString()}`;
      const name = window.prompt('Menu name:', defaultName);
      if (!name) return;

      const { data: m, error: mErr } = await supabase
        .from('menus')
        .insert({ tenant_id: tenantId, name })
        .select('id')
        .single();
      if (mErr) throw mErr;

      const newId = m!.id as string;
      const rows = entries.map(([recipe_id, servings]) => ({
        menu_id: newId,
        recipe_id,
        servings: Number(servings),
        price: 0,
      }));
      const { error: rErr } = await supabase.from('menu_recipes').insert(rows);
      if (rErr) throw rErr;

      setMenus(ms => [{ id: newId, name, updated_at: new Date().toISOString() }, ...ms]);
      setSelectedMenuId(newId);
      setShareToken(null);
      setStatus('Menu saved as new.');
    } catch (err: any) {
      alert(err.message ?? 'Error saving new menu');
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

      const token = crypto.randomUUID().replace(/-/g, '').slice(0, 24);
      const payload = {
        menu_id: selectedMenuId,
        name: menus.find(m => m.id === selectedMenuId)?.name ?? 'Menu',
      };

      const { error } = await supabase.from('menu_shares').insert({
        token, tenant_id: tenantId, menu_id: selectedMenuId, payload,
      });
      if (error) throw error;

      setShareToken(token);
      await copyShareToClipboard(token);
      setStatus('Public share link created & copied.');
    } catch (err: any) {
      alert(err.message ?? 'Error creating share link');
    } finally {
      setBusy(false);
    }
  }

  async function copyShare() {
    if (!shareToken) { alert('No share link yet'); return; }
    await copyShareToClipboard(shareToken);
    setStatus('Share link copied.');
  }

  async function revokeShare() {
    try {
      if (!selectedMenuId) return;
      setBusy(true);
      await supabase.from('menu_shares').delete().eq('menu_id', selectedMenuId);
      setShareToken(null);
      setStatus('Share link revoked.');
    } catch (err: any) {
      alert(err.message ?? 'Error revoking share link');
    } finally {
      setBusy(false);
    }
  }

  async function copyShareToClipboard(token: string) {
    const origin = typeof window !== 'undefined'
      ? window.location.origin
      : 'https://kitchenbiz.vercel.app';
    const url = `${origin}/share/${token}`;
    try { await navigator.clipboard.writeText(url); } catch {}
  }

  const selectedList = useMemo(
    () =>
      Object.keys(sel)
        .map(id => ({
          id,
          servings: sel[id],
          name: recipes.find(r => r.id === id)?.name || 'Untitled',
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [sel, recipes]
  );

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Menu</h1>

      {status && <p className="text-xs text-emerald-400">{status}</p>}

      {/* Controls row (left + right in same line) */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <form onSubmit={handleLoad} className="flex items-center gap-2">
            <label className="text-sm">Saved menus:</label>
            <select
              className="border rounded-md px-2 py-2"
              value={selectedMenuId ?? ''}
              onChange={e => setSelectedMenuId(e.target.value || null)}
            >
              {(menus ?? []).map(m => (
                <option key={m.id} value={m.id}>
                  {m.name || 'Untitled'} • {m.updated_at ? new Date(m.updated_at).toLocaleDateString() : ''}
                </option>
              ))}
            </select>
            <button className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">Load</button>
          </form>

          {/* New Menu styled like a button */}
          <button
            disabled={busy}
            onClick={createNewMenu}
            className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
          >
            New Menu
          </button>

          <button
            disabled={busy}
            onClick={saveCurrentMenu}
            className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
          >
            Save
          </button>
          <button
            disabled={busy}
            onClick={saveAsNewMenu}
            className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
          >
            Save as new
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={doPrint} className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
            Print
          </button>

          {!shareToken ? (
            <button
              disabled={busy}
              onClick={createShare}
              className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
            >
              Create share link
            </button>
          ) : (
            <>
              <button onClick={copyShare} className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
                Copy share
              </button>
              <button onClick={revokeShare} className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
                Revoke
              </button>
            </>
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
            {recipes.length === 0 && (
              <div className="text-sm text-neutral-400">No recipes yet. Create some in “Recipes”.</div>
            )}
          </div>
        </div>

        <div className="border rounded p-4">
          <div className="font-semibold mb-2">Quantities (portions)</div>
          {selectedList.length === 0 ? (
            <p className="text-sm text-neutral-400">Add recipes on the left.</p>
          ) : (
            <div className="space-y-2">
              {selectedList.map(row => (
                <div key={row.id} className="grid grid-cols-6 gap-2 items-center">
                  <div className="col-span-4">
                    <div className="font-medium">{row.name}</div>
                  </div>
                  <input
                    className="border rounded p-1 col-span-1 text-right"
                    type="number" min={0} step={1}
                    value={sel[row.id]}
                    onChange={(e) => setQty(row.id, Number(e.target.value))}
                  />
                  <button className="text-xs underline col-span-1 justify-self-end" onClick={() => removeRecipe(row.id)}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
