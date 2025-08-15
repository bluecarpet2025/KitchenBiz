'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

// If you previously had this, it's okay to keep; it just prevents static
// prerender in case you need full CSR for this page on Vercel.
// (Keep it AFTER the 'use client' line.)
export const dynamic = 'force-dynamic';

// ------------ Types ------------
type Recipe = {
  id: string;
  name: string;
  batch_yield_qty: number | null;
  batch_yield_unit: string | null;
  yield_pct: number | null;
};
type Ingredient = { recipe_id: string; item_id: string; qty: number };
type Item = {
  id: string;
  name: string;
  pack_to_base_factor: number;
  last_price: number | null;
  base_unit: string;
};

type RoundStyle = '99' | '95' | '49' | '00';

// ------------ Helpers ------------
function roundPrice(raw: number, style: RoundStyle) {
  const f = Math.floor(raw);
  switch (style) {
    case '99':
      return Number((f + 0.99).toFixed(2));
    case '95':
      return Number((f + 0.95).toFixed(2));
    case '49':
      return Number((f + 0.49).toFixed(2));
    case '00':
      return Math.round(raw * 100) / 100; // .00
  }
}
function suggestPrice(costPerPortion: number, targetPct: number, style: RoundStyle) {
  if (!targetPct || targetPct <= 0) return 0;
  return roundPrice(costPerPortion / targetPct, style);
}

export default function MenuToday() {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [portionCost, setPortionCost] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  // menu build state
  const [selection, setSelection] = useState<Record<string, { price?: number; manual?: boolean }>>({});
  const [targetPct, setTargetPct] = useState<number>(0.30);
  const [rounding, setRounding] = useState<RoundStyle>('99');
  const [status, setStatus] = useState<string | null>(null);

  // current/open menu
  const [currentMenuId, setCurrentMenuId] = useState<string | null>(null);

  const chosen = useMemo(() => recipes.filter((r) => selection[r.id]), [recipes, selection]);

  // ------------ Initial data load ------------
  useEffect(() => {
    (async () => {
      setLoading(true);
      setStatus(null);

      // who am I?
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) {
        setStatus('Not signed in');
        setLoading(false);
        return;
      }

      // which tenant?
      const { data: prof } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', uid)
        .maybeSingle();

      if (!prof?.tenant_id) {
        setStatus('No tenant');
        setLoading(false);
        return;
      }
      setTenantId(prof.tenant_id);

      // load recipes
      const { data: recs } = await supabase
        .from('recipes')
        .select('id,name,batch_yield_qty,batch_yield_unit,yield_pct')
        .order('name');

      const recipesData = (recs ?? []) as Recipe[];
      setRecipes(recipesData);

      if (recipesData.length === 0) {
        setPortionCost({});
        setLoading(false);
        return;
      }

      // load ingredients for those recipes
      const rIds = recipesData.map((r) => r.id);
      const { data: ing } = await supabase
        .from('recipe_ingredients')
        .select('recipe_id,item_id,qty')
        .in('recipe_id', rIds);

      const ingredients = (ing ?? []) as Ingredient[];

      // load inventory items used in those ingredients
      const itemIds = Array.from(new Set(ingredients.map((i) => i.item_id)));
      const { data: itemsData } = await supabase
        .from('inventory_items')
        .select('id,name,base_unit,pack_to_base_factor,last_price')
        .in('id', itemIds);

      const itemsMap: Record<string, Item> = {};
      (itemsData ?? []).forEach((it: any) => (itemsMap[it.id] = it as Item));

      // cost per portion calc
      const costMap: Record<string, number> = {};
      for (const r of recipesData) {
        const rIngs = ingredients.filter((i) => i.recipe_id === r.id);
        let batchCost = 0;
        rIngs.forEach((ing) => {
          const it = itemsMap[ing.item_id];
          if (!it) return;
          const costPerBase = it.last_price ? Number(it.last_price) / Number(it.pack_to_base_factor) : 0;
          batchCost += costPerBase * Number(ing.qty || 0);
        });
        const yieldPct = Number(r.yield_pct ?? 1);
        const portions = Math.max(1, Number(r.batch_yield_qty ?? 1));
        const effective = yieldPct > 0 ? batchCost / yieldPct : batchCost;
        costMap[r.id] = effective / portions;
      }

      setPortionCost(costMap);
      setLoading(false);
    })();
  }, []);

  // Keep non-manual suggested prices updated when target/rounding/costs change
  useEffect(() => {
    setSelection((prev) => {
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

  // ---------- Save helpers (strictly typed) ----------
  const rowsForSave = (menuId: string) => {
    return chosen.map((r) => ({
      menu_id: menuId,
      recipe_id: r.id,
      price: selection[r.id]?.price ?? 0,
      target_pct: targetPct,
      rounding,
      manual: !!selection[r.id]?.manual,
    }));
  };

  // Save: update existing menu (if open) or create a new one
  async function saveMenu() {
    if (!tenantId) return;
    if (chosen.length === 0) {
      setStatus('Pick at least one item');
      return;
    }
    setStatus('Saving…');

    let menuId: string;

    if (currentMenuId) {
      // Update existing: clear rows and re-insert
      menuId = currentMenuId;
      const { error: delErr } = await supabase.from('menu_recipes').delete().eq('menu_id', menuId);
      if (delErr) {
        setStatus(delErr.message);
        return;
      }
    } else {
      // Create new
      const { data: menu, error: mErr } = await supabase
        .from('menus')
        .insert({
          tenant_id: tenantId,
          name: "Today's Menu",
          served_on: new Date().toISOString().slice(0, 10),
        })
        .select('id')
        .single();

      if (mErr || !menu?.id) {
        setStatus(mErr?.message || 'Failed creating menu');
        return;
      }
      menuId = menu.id; // now guaranteed to be a string
      setCurrentMenuId(menuId);
    }

    const rows = rowsForSave(menuId);
    const { error: iErr } = await supabase.from('menu_recipes').insert(rows);
    if (iErr) {
      setStatus(iErr.message);
      return;
    }

    setStatus('Saved ✅');
  }

  // Save as a brand new menu (name prompt)
  async function saveAsNew() {
    if (!tenantId) return;
    if (chosen.length === 0) {
      setStatus('Pick at least one item');
      return;
    }
    const name = (typeof window !== 'undefined' ? window.prompt('Name this menu:', 'Menu') : null) || 'Menu';
    setStatus('Saving as new…');

    const { data: menu, error: mErr } = await supabase
      .from('menus')
      .insert({
        tenant_id: tenantId,
        name,
        served_on: new Date().toISOString().slice(0, 10),
      })
      .select('id')
      .single();

    if (mErr || !menu?.id) {
      setStatus(mErr?.message || 'Failed creating menu');
      return;
    }

    const rows = rowsForSave(menu.id);
    const { error: iErr } = await supabase.from('menu_recipes').insert(rows);
    if (iErr) {
      setStatus(iErr.message);
      return;
    }

    setCurrentMenuId(menu.id);
    setStatus('Saved new menu ✅');
  }

  // Load last saved menu
  async function loadLast() {
    if (!tenantId) return;
    setStatus('Loading last…');

    const { data: menus, error } = await supabase
      .from('menus')
      .select('id, served_on')
      .order('served_on', { ascending: false })
      .limit(1);
    if (error || !menus?.length) {
      setStatus('No previous menu');
      return;
    }

    const lastId = menus[0].id as string;
    const { data: rows, error: rErr } = await supabase
      .from('menu_recipes')
      .select('recipe_id, price, manual, target_pct, rounding')
      .eq('menu_id', lastId);
    if (rErr) {
      setStatus(rErr.message);
      return;
    }

    const sel: Record<string, { price?: number; manual?: boolean }> = {};
    rows?.forEach((row) => {
      sel[row.recipe_id] = { price: Number(row.price), manual: row.manual || false };
    });
    setSelection(sel);
    setCurrentMenuId(lastId);

    // adopt last menu's target/rounding if present
    if (rows && rows.length) {
      const rp = rows.find(Boolean);
      if (rp?.target_pct) setTargetPct(Number(rp.target_pct));
      if (rp?.rounding) setRounding(rp.rounding as RoundStyle);
    }
    setStatus('Loaded last menu ✅');
  }

  const printNow = () => window.print();

  // ------------ UI ------------
  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between print:hidden">
        <h1 className="text-2xl font-semibold">Today&apos;s Menu</h1>
        <div className="flex gap-2">
          <button onClick={loadLast} className="border rounded px-3 py-2">
            Load last
          </button>
          <button onClick={saveMenu} className="border rounded px-3 py-2">
            Save
          </button>
          <button onClick={saveAsNew} className="border rounded px-3 py-2">
            Save as new
          </button>
          <button onClick={printNow} className="bg-black text-white rounded px-4 py-2">
            Print
          </button>
        </div>
      </div>

      {status && <div className="text-sm text-neutral-300 print:hidden">{status}</div>}

      {/* Controls */}
      <div className="border rounded p-4 space-y-3 print:hidden">
        <div className="flex items-center gap-4 text-sm">
          <div className="font-semibold">Food-cost target</div>
          <input
            type="range"
            min={10}
            max={60}
            step={1}
            value={Math.round(targetPct * 100)}
            onChange={(e) => setTargetPct(Number(e.target.value) / 100)}
            className="w-64"
          />
        <div>{Math.round(targetPct * 100)}%</div>

          <div className="ml-6 font-semibold">Rounding</div>
          <select className="border p-1" value={rounding} onChange={(e) => setRounding(e.target.value as RoundStyle)}>
            <option value="99">.99</option>
            <option value="95">.95</option>
            <option value="49">.49</option>
            <option value="00">.00</option>
          </select>
        </div>
        <p className="text-xs text-neutral-400">
          Suggested price = cost per portion ÷ target% (rounded). Edits you make are kept when changing the slider or
          rounding.
        </p>
      </div>

      {/* Builder */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 print:hidden">
        <div className="border rounded p-4">
          <div className="font-semibold mb-2">Pick items</div>
          {loading ? (
            <div className="text-sm text-neutral-400">Loading…</div>
          ) : (
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
                        Cost/portion: ${cpp.toFixed(2)} • Suggested ({Math.round(targetPct * 100)}% {'.' + rounding}): $
                        {suggested.toFixed(2)}
                        {manual && <span className="ml-2 text-yellow-400">(edited)</span>}
                      </div>
                    </div>
                    <div className="col-span-1 text-right">$</div>
                    <input
                      className="border p-1 w-28 col-span-2"
                      type="number"
                      step="0.01"
                      min="0"
                      value={Number.isFinite(price) ? price : ''}
                      onChange={(e) => setPrice(r.id, Number(e.target.value))}
                    />
                    <button
                      type="button"
                      onClick={() => resetToSuggest(r.id)}
                      className="col-span-1 text-xs underline justify-self-end"
                    >
                      Reset
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Printable simple view */}
      <div className="print:block hidden">
        <div className="text-center mb-4">
          <h1 className="text-3xl font-bold">Today&apos;s Menu</h1>
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
