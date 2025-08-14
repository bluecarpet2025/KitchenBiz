'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { costPerBaseUnit } from '@/lib/costing';
import Tip from '@/components/Tip';

type Item = {
  id: string; name: string;
  base_unit: string; purchase_unit: string;
  pack_to_base_factor: number; last_price: number | null;
};

// One source of truth for column widths (used by header/add/table)
const COLS = ['16rem', '7rem', '7rem', '8rem', '8rem', '8rem'] as const;

export default function InventoryPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    base_unit: 'g',
    purchase_unit: 'kg',
    pack_to_base_factor: 1000,
    last_price: 0,
  });

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id; if (!uid) return setErr('Not signed in');
      const { data: prof } = await supabase.from('profiles').select('tenant_id').eq('id', uid).maybeSingle();
      if (!prof?.tenant_id) return setErr('No tenant. Visit /app.');
      setTenantId(prof.tenant_id);

      const { data, error } = await supabase
        .from('inventory_items')
        .select('id,name,base_unit,purchase_unit,pack_to_base_factor,last_price')
        .order('name');
      if (error) setErr(error.message);
      setItems(data ?? []);
    })();
  }, []);

  async function addItem() {
    setErr(null);
    if (!tenantId) return setErr('No tenant');
    const { data, error } = await supabase.from('inventory_items').insert({
      tenant_id: tenantId,
      name: form.name.trim(),
      base_unit: form.base_unit,
      purchase_unit: form.purchase_unit,
      pack_to_base_factor: Number(form.pack_to_base_factor),
      last_price: Number(form.last_price),
    }).select('id,name,base_unit,purchase_unit,pack_to_base_factor,last_price').single();
    if (error) return setErr(error.message);
    setItems(prev => [data as Item, ...prev]);
    setForm({ name: '', base_unit: 'g', purchase_unit: 'kg', pack_to_base_factor: 1000, last_price: 0 });
  }

  async function updatePrice(id: string, value: number) {
    setItems(prev => prev.map(it => it.id === id ? { ...it, last_price: value } : it));
    const { error } = await supabase.from('inventory_items').update({ last_price: value }).eq('id', id);
    if (error) setErr(error.message);
  }

  return (
    <div className="space-y-6">
      {/* HEADER ROW (uses the same colgroup; Import shares col 6 with Add item/$base) */}
      <div className="max-w-5xl">
        <table className="w-full table-auto" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: COLS[0] }} />
            <col style={{ width: COLS[1] }} />
            <col style={{ width: COLS[2] }} />
            <col style={{ width: COLS[3] }} />
            <col style={{ width: COLS[4] }} />
            <col style={{ width: COLS[5] }} />
          </colgroup>
          <tbody>
            <tr>
              <td className="px-3 py-1" colSpan={5}>
                <div className="flex items-baseline gap-4">
                  <h1 className="text-2xl font-semibold">Inventory</h1>
                  <a className="underline text-sm" href="/app">← Home</a>
                </div>
              </td>
              {/* Import sits in the same column as $/base (col 6), aligned with Add item start */}
              <td className="px-3 py-1">
                <Link
                  href="/inventory/import"
                  className="w-28 text-sm border rounded py-2 hover:bg-neutral-900 inline-flex items-center justify-center"
                >
                  Import
                </Link>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {err && <p className="text-red-500">{err}</p>}

      {/* ADD ROW: also a table with the same colgroup; button starts at the left of col 6 */}
      <div className="max-w-5xl">
        <table className="w-full text-sm table-auto" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: COLS[0] }} />
            <col style={{ width: COLS[1] }} />
            <col style={{ width: COLS[2] }} />
            <col style={{ width: COLS[3] }} />
            <col style={{ width: COLS[4] }} />
            <col style={{ width: COLS[5] }} />
          </colgroup>
          <tbody>
            <tr>
              {/* 1 Name */}
              <td className="px-3 pb-2 align-bottom">
                <label className="block text-xs mb-1">Item name</label>
                <input
                  className="border border-neutral-700 bg-black p-2 rounded w-full"
                  placeholder="e.g. Mozzarella"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  required
                />
              </td>

              {/* 2 Base */}
              <td className="px-3 pb-2 align-bottom">
                <label className="block text-xs mb-1">
                  Base unit <Tip text="The unit you use in recipes (e.g., g, ml, each)." />
                </label>
                <select
                  className="border border-neutral-700 bg-black p-2 rounded w-full"
                  value={form.base_unit}
                  onChange={e => setForm({ ...form, base_unit: e.target.value })}
                >
                  <option>g</option><option>ml</option><option>each</option><option>oz</option><option>lb</option>
                </select>
              </td>

              {/* 3 Purchase */}
              <td className="px-3 pb-2 align-bottom">
                <label className="block text-xs mb-1">
                  Purchase <Tip text="What you buy from vendors (e.g., kg, L, case)." />
                </label>
                <select
                  className="border border-neutral-700 bg-black p-2 rounded w-full"
                  value={form.purchase_unit}
                  onChange={e => setForm({ ...form, purchase_unit: e.target.value })}
                >
                  <option>kg</option><option>l</option><option>case</option><option>each</option><option>lb</option>
                </select>
              </td>

              {/* 4 Pack→Base */}
              <td className="px-3 pb-2 align-bottom">
                <label className="block text-xs mb-1">
                  Pack → Base <Tip text="How many base units are in ONE purchase unit (e.g., 1 kg = 1000 g)." />
                </label>
                <input
                  className="border border-neutral-700 bg-black p-2 rounded w-full"
                  type="number" step="0.0001"
                  value={form.pack_to_base_factor}
                  onChange={e => setForm({ ...form, pack_to_base_factor: Number(e.target.value) })}
                />
              </td>

              {/* 5 Last price */}
              <td className="px-3 pb-2 align-bottom">
                <label className="block text-xs mb-1">
                  Last price ($) <Tip text="Price for ONE purchase unit last time you bought it." />
                </label>
                <input
                  className="border border-neutral-700 bg-black p-2 rounded w-full"
                  type="number" step="0.01"
                  value={form.last_price}
                  onChange={e => setForm({ ...form, last_price: Number(e.target.value) })}
                />
              </td>

              {/* 6 $/base position: Add item starts at the left edge of col 6 (same as $/base header) */}
              <td className="px-3 pb-2 align-bottom">
                <button onClick={addItem} className="w-28 bg-white text-black font-medium rounded px-4 py-2">
                  Add item
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* MAIN TABLE (shares the same colgroup) */}
      <div className="max-w-5xl">
        <table className="w-full text-sm table-auto border-separate border-spacing-y-1" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: COLS[0] }} />
            <col style={{ width: COLS[1] }} />
            <col style={{ width: COLS[2] }} />
            <col style={{ width: COLS[3] }} />
            <col style={{ width: COLS[4] }} />
            <col style={{ width: COLS[5] }} />
          </colgroup>
          <thead>
            <tr className="text-left text-neutral-300">
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Base</th>
              <th className="px-3 py-2">Purchase</th>
              <th className="px-3 py-2">Pack→Base</th>
              <th className="px-3 py-2">Last Price</th>
              <th className="px-3 py-2">$ / base</th>
            </tr>
          </thead>
          <tbody>
            {items.map(it => {
              const unitCost = (it.last_price && it.pack_to_base_factor)
                ? costPerBaseUnit(Number(it.last_price), Number(it.pack_to_base_factor)) : 0;
              return (
                <tr key={it.id} className="bg-neutral-950/60 hover:bg-neutral-900 rounded">
                  <td className="px-3 py-2 rounded-l">{it.name}</td>
                  <td className="px-3 py-2">{it.base_unit}</td>
                  <td className="px-3 py-2">{it.purchase_unit}</td>
                  <td className="px-3 py-2">{it.pack_to_base_factor}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <span className="opacity-75">$</span>
                      <input
                        className="border border-neutral-700 bg-black p-1 w-full rounded"
                        type="number" step="0.01"
                        value={it.last_price ?? 0}
                        onChange={(e) => updatePrice(it.id, Number(e.target.value))}
                      />
                    </div>
                  </td>
                  <td className="px-3 py-2 rounded-r">{unitCost ? `$${unitCost.toFixed(4)}` : '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
