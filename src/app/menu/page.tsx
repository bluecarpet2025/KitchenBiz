'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Recipe = {
  id: string; name: string;
  batch_yield_qty: number | null; batch_yield_unit: string | null; yield_pct: number | null;
};
type Ingredient = { recipe_id: string; item_id: string; qty: number };
type Item = { id: string; name: string; pack_to_base_factor: number; last_price: number | null; base_unit: string };

type RoundStyle = '99' | '95' | '49' | '00';
type SavedMenu = { id: string; name: string | null; served_on: string | null };

function roundPrice(raw: number, style: RoundStyle) {
  const f = Math.floor(raw);
  switch (style) {
    case '99': return Number((f + 0.99).toFixed(2));
    case '95': return Number((f + 0.95).toFixed(2));
    case '49': return Number((f + 0.49).toFixed(2));
    case '00': return Math.round(raw * 100) / 100;
  }
}
function suggestPrice(costPerPortion: number, targetPct: number, style: RoundStyle) {
  if (!targetPct || targetPct <= 0) return 0;
  return roundPrice(costPerPortion / targetPct, style);
}
function tokenBase64Url(bytes = 16) {
  const arr = new Uint8Array(bytes);
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < bytes; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  const b64 = btoa(String.fromCharCode(...arr));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export default function MenuToday() {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [portionCost, setPortionCost] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  // build state
  const [selection, setSelection] = useState<Record<string, { price?: number; manual?: boolean }>>({});
  const [targetPct, setTargetPct] = useState<number>(0.30);
  const [rounding, setRounding] = useState<RoundStyle>('99');
  const [status, setStatus] = useState<string | null>(null);

  // saved menus
  const [currentMenuId, setCurrentMenuId] = useState<string | null>(null);
  const [menuName, setMenuName] = useState<string>(() => {
    const d = new Date();
    return `Today's Menu ${d.toLocaleDateString()}`;
  });
  const [menuList, setMenuList] = useState<SavedMenu[]>([]);
  const [menuToLoadId, setMenuToLoadId] = useState<string>('');

  // share url
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  const chosen = useMemo(() => recipes.filter(r => selection[r.id]), [recipes, selection]);

  useEffect(() => {
    (async () => {
      setLoading(true);

      // who am i / tenant
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
        .order('name');
      const recipesData = (recs ?? []) as Recipe[];
      setRecipes(recipesData);

      if (recipesData.length === 0) { setPortionCost({}); setLoading(false); return; }

      // ingredients for those recipes
      const rIds = recipesData.map(r => r.id);
      const { data: ing } = await supabase
        .from('recipe_ingredients')
        .select('recipe_id,item_id,qty')
        .in('recipe_id', rIds);
      const ingredients = (ing ?? []) as Ingredient[];

      // inventory items used
      const itemIds = Array.from(new Set(ingredients.map(i => i.item_id)));
      const { data: itemsData } = await supabase
        .from('inventory_items')
        .select('id,name,base_unit,pack_to_base_factor,last_price')
        .in('id', itemIds);
      const itemsMap: Record<string, Item> = {};
      (itemsData ?? []).forEach((it: any) => (itemsMap[it.id] = it as Item));

      // compute cost per portion
      const costMap: Record<string, number> = {};
      for (const r of recipesData) {
        const rIngs = ingredients.filter(i => i.recipe_id === r.id);
        let batchCost = 0;
        for (const ingRow of rIngs) {
          const it = itemsMap[ingRow.item_id];
          if (!it) continue;
          const costPerBase = it.last_price ? Number(it.last_price) / Number(it.pack_to_base_factor) : 0;
          batchCost += costPerBase * Number(ingRow.qty || 0);
        }
        const yieldPct = Number(r.yield_pct ?? 1);
        const portions = Math.max(1, Number(r.batch_yield_qty ?? 1));
        const effective = yieldPct > 0 ? batchCost / yieldPct : batchCost;
        costMap[r.id] = effective / portions;
      }
      setPortionCost(costMap);
      setLoading(false);

      // load recent saved menus for this tenant
      await refreshMenuList(prof.tenant_id);
    })();
  }, []);

  async function refreshMenuList(tid: string) {
    const { data } = await supabase
      .from('menus')
      .select('id,name,served_on')
      .eq('tenant_id', tid)
      .order('served_on', { ascending: false })
      .limit(25);
    setMenuList((data ?? []) as SavedMenu[]);
  }

  // keep suggestions fresh for non-manual rows
  useEffect(() => {
    setSelection(prev => {
      const next = { ...prev };
      for (const id of Object.keys(next)) {
        if (!next[id]?.manual) {
          const cpp = portionCost[id] ?? 0;
          next[id] = { price: suggestPrice(cpp, targetPct, rounding), manual: false };
        }
      }
      return next;
    });
  }, [targetPct, rounding, portionCost]);

  const toggle = (id: string) => {
    setSelection((s) => {
      const copy = { ...s };
      if (copy[id]) delete copy[id];
      else {
        const cpp = portionCost[id] ?? 0;
        copy[id] = { price: suggestPrice(cpp, targetPct, rounding), manual: false };
      }
      return copy;
    });
  };

  const setPrice = (id: string, val: number) =>
    setSelection((s) => ({ ...s, [id]: { price: Number(val), manual: true } }));

  const resetToSuggest = (id: string) =>
    setSelection((s) => {
      const cpp = portionCost[id] ?? 0;
      return { ...s, [id]: { price: suggestPrice(cpp, targetPct, rounding), manual: false } };
    });

  function rowsForSave(menuId: string) {
    return chosen.map(r => ({
      menu_id: menuId,
      recipe_id: r.id,
      price: selection[r.id]?.price ?? 0,
      target_pct: targetPct,
      rounding,
      manual: !!selection[r.id]?.manual
    }));
  }

  async function saveAs() {
    if (!tenantId) return;
    if (chosen.length === 0) { setStatus('Pick at least one item'); return; }
    setStatus('Saving…');

    const { data: menu, error: mErr } = await supabase
      .from('menus')
      .insert({ tenant_id: tenantId, name: menuName })
      .select('id')
      .single();
    if (mErr) { setStatus(mErr.message); return; }

    const rows = rowsForSave(menu!.id);
    const { error: iErr } = await supabase.from('menu_recipes').insert(rows);
    if (iErr) { setStatus(iErr.message); return; }

    setCurrentMenuId(menu!.id);
    setStatus('Saved as new menu ✅');
    refreshMenuList(tenantId);
  }

  async function saveMenu() {
    if (!tenantId) return;
    if (!currentMenuId) { await saveAs(); return; }
    if (chosen.length === 0) { setStatus('Pick at least one item'); return; }
    setStatus('Saving…');

    await supabase.from('menus').update({ name: menuName }).eq('id', currentMenuId);
    await supabase.from('menu_recipes').delete().eq('menu_id', currentMenuId);
    const rows = rowsForSave(currentMenuId);
    const { error: iErr } = await supabase.from('menu_recipes').insert(rows);
    if (iErr) { setStatus(iErr.message); return; }

    setStatus('Menu saved ✅');
    refreshMenuList(tenantId);
  }

  async function loadLast() {
    if (!tenantId) return;
    setStatus('Loading last…');
    const { data: menus, error } = await supabase
      .from('menus')
      .select('id,name,served_on')
      .eq('tenant_id', tenantId)
      .order('served_on', { ascending: false })
      .limit(1);
    if (error || !menus?.length) { setStatus('No previous menu'); return; }
    await loadMenuById(menus[0].id);
  }

  async function loadMenuById(menuId: string) {
    if (!tenantId) return;
    setStatus('Loading…');

    const { data: m } = await supabase
      .from('menus')
      .select('id,name,served_on')
      .eq('id', menuId)
      .maybeSingle();

    const { data: rows, error: rErr } = await supabase
      .from('menu_recipes')
      .select('recipe_id, price, manual, target_pct, rounding')
      .eq('menu_id', menuId);
    if (rErr) { setStatus(rErr.message); return; }

    const sel: Record<string, { price?: number; manual?: boolean }> = {};
    rows?.forEach(row => { sel[row.recipe_id] = { price: Number(row.price), manual: row.manual || false }; });
    setSelection(sel);

    if (rows && rows.length) {
      const rp = rows.find(Boolean);
      if (rp?.target_pct) setTargetPct(Number(rp.target_pct));
      if (rp?.rounding) setRounding(rp.rounding as RoundStyle);
    }

    setMenuName(m?.name || '');
    setCurrentMenuId(menuId);
    setMenuToLoadId(menuId);
    setStatus('Loaded menu ✅');
  }

  function startNewMenu() {
    setCurrentMenuId(null);
    setSelection({});
    setTargetPct(0.30);
    setRounding('99');
    const d = new Date();
    setMenuName(`Today's Menu ${d.toLocaleDateString()}`);
    setStatus('New menu');
    setShareUrl(null);
  }

  function buildSharePayload() {
    const items = chosen.map(r => {
      const cpp = portionCost[r.id] ?? 0;
      const suggested = suggestPrice(cpp, targetPct, rounding);
      const price = selection[r.id]?.price ?? suggested;
      return { name: r.name, price: Number(price) };
    });
    return {
      name: menuName || "Today's Menu",
      served_on: new Date().toISOString().slice(0, 10),
      items,
    };
  }

  async function shareMenu() {
    if (!tenantId) return;
    if (chosen.length === 0) { setStatus('Pick at least one item'); return; }

    // ensure there's a saved menu id
    let menuId = currentMenuId;
    if (!menuId) {
      setStatus('Saving before sharing…');
      const { data: menu, error: mErr } = await supabase
        .from('menus')
        .insert({ tenant_id: tenantId, name: menuName })
        .select('id')
        .single();
      if (mErr) { setStatus(mErr.message); return; }
      menuId = menu!.id;
      const rows = rowsForSave(menuId);
      const { error: iErr } = await supabase.from('menu_recipes').insert(rows);
      if (iErr) { setStatus(iErr.message); return; }
      setCurrentMenuId(menuId);
    }

    setStatus('Creating share link…');
    const token = tokenBase64Url(16);
    const payload = buildSharePayload();
    const { data, error } = await supabase
      .from('menu_shares')
      .insert({ tenant_id: tenantId, menu_id: menuId, token, payload })
      .select('token')
      .single();
    if (error) { setStatus(error.message); return; }

    const url = `${window.location.origin}/menu/share/${data!.token}`;
    setShareUrl(url);
    setStatus('Share link ready ✅');
  }

  const printNow = () => window.print();
  const copyShare = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setStatus('Share link copied ✂️');
  };

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex items-start justify-between gap-4 print:hidden">
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">Today&apos;s Menu</h1>
          <div className="mt-2 flex items-center gap-2">
            <label className="text-sm opacity-80">Menu name</label>
            <input
              className="border rounded px-2 py-1 text-sm w-[320px]"
              value={menuName}
              onChange={(e) => setMenuName(e.target.value)}
              placeholder="Name this menu…"
            />
            {currentMenuId && (
              <span className="text-xs opacity-60 ml-2">Loaded: {currentMenuId.slice(0, 8)}…</span>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-2">
            <button onClick={startNewMenu} className="border rounded px-3 py-2">New</button>
            <button onClick={loadLast} className="border rounded px-3 py-2">Load last</button>
            <button onClick={saveMenu} className="border rounded px-3 py-2">Save</button>
            <button onClick={saveAs} className="border rounded px-3 py-2">Save as</button>
            <button onClick={shareMenu} className="border rounded px-3 py-2">Share</button>
            <button onClick={printNow} className="bg-black text-white rounded px-4 py-2">Print</button>
          </div>

          {/* Saved menus list */}
          <div className="flex items-center gap-2">
            <span className="text-sm opacity-80">Load:</span>
            <select
              className="border rounded px-2 py-1 text-sm min-w-[260px]"
              value={menuToLoadId}
              onChange={(e) => setMenuToLoadId(e.target.value)}
            >
              <option value="" disabled>Select a saved menu…</option>
              {menuList.map(m => (
                <option key={m.id} value={m.id}>
                  {(m.name || 'Untitled')} {m.served_on ? `• ${new Date(m.served_on).toLocaleDateString()}` : ''}
                </option>
              ))}
            </select>
            <button
              disabled={!menuToLoadId}
              onClick={() => loadMenuById(menuToLoadId)}
              className="border rounded px-3 py-1 text-sm disabled:opacity-50"
            >
              Load
            </button>
          </div>

          {/* Share link */}
          {shareUrl && (
            <div className="text-xs opacity-80 flex items-center gap-2">
              <span className="truncate max-w-[420px]">{shareUrl}</span>
              <button onClick={copyShare} className="underline">Copy</button>
            </div>
          )}
        </div>
      </div>

      {status && <div className="text-sm text-neutral-300 print:hidden">{status}</div>}

      {/* Controls */}
      <div className="border rounded p-4 space-y-3 print:hidden">
        <div className="flex items-center gap-4 text-sm">
          <div className="font-semibold">Food-cost target</div>
          <input
            type="range" min={10} max={60} step={1}
            value={Math.round(targetPct * 100)}
            onChange={(e) => setTargetPct(Number(e.target.value) / 100)}
            className="w-64"
          />
          <div>{Math.round(targetPct * 100)}%</div>

          <div className="ml-6 font-semibold">Rounding</div>
          <select className="border p-1" value={rounding} onChange={e => setRounding(e.target.value as RoundStyle)}>
            <option value="99">.99</option>
            <option value="95">.95</option>
            <option value="49">.49</option>
            <option value="00">.00</option>
          </select>
        </div>
        <p className="text-xs text-neutral-400">
          Suggested price = cost per portion ÷ target% (rounded). Edits you make are kept when changing the slider or rounding.
        </p>
      </div>

      {/* Builder */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 print:hidden">
        <div className="border rounded p-4">
          <div className="font-semibold mb-2">Pick items</div>
          {loading ? <div className="text-sm text-neutral-400">Loading…</div> : (
            <div className="space-y-2 max-h-[60vh] overflow-auto pr-2">
              {recipes.map((r) => (
                <label key={r.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!selection[r.id]} onChange={() => toggle(r.id)} />
                  <span>{r.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="border rounded p-4">
          <div className="font-semibold mb-2">Set prices</div>
          {chosen.length === 0 ? (
            <p className="text-sm text-neutral-400">Choose items on the left.</p>
          ) : (
            <div className="space-y-3">
              {chosen.map((r) => {
                const cpp = portionCost[r.id] ?? 0;
                const suggested = suggestPrice(cpp, targetPct, rounding);
                const price = selection[r.id]?.price ?? suggested;
                const manual = selection[r.id]?.manual ?? false;
                return (
                  <div key={r.id} className="grid grid-cols-8 gap-2 items-center">
                    <div className="col-span-4">
                      <div className="font-medium">{r.name}</div>
                      <div className="text-xs text-neutral-400">
                        Cost/portion: ${cpp.toFixed(2)} • Suggested ({Math.round(targetPct * 100)}% {'.' + rounding}): ${suggested.toFixed(2)}
                        {manual && <span className="ml-2 text-yellow-400">(edited)</span>}
                      </div>
                    </div>
                    <div className="col-span-1 text-right">$</div>
                    <input
                      className="border p-1 w-28 col-span-2"
                      type="number" step="0.01" min="0"
                      value={Number.isFinite(price) ? price : ''}
                      onChange={(e) => setPrice(r.id, Number(e.target.value))}
                    />
                    <button type="button" onClick={() => resetToSuggest(r.id)} className="col-span-1 text-xs underline justify-self-end">
                      Reset
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Printable view */}
      <div className="print:block hidden">
        <div className="text-center mb-4">
          <h1 className="text-3xl font-bold">{menuName || "Today's Menu"}</h1>
          <div className="text-sm">{new Date().toLocaleDateString()}</div>
        </div>
        <table className="w-full text-lg">
          <tbody>
            {chosen.map((r) => (
              <tr key={r.id}>
                <td className="py-2 pr-4">{r.name}</td>
                <td className="py-2 text-right">
                  {selection[r.id]?.price ? `$${Number(selection[r.id]?.price).toFixed(2)}` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <style>{`
        @media print {
          body { color: #000; background: #fff; }
          header, nav, .print\\:hidden { display: none !important; }
          .print\\:block { display: block !important; }
        }
      `}</style>
    </div>
  );
}
