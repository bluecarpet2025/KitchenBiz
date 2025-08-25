// src/app/recipes/new/page.tsx
'use client';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Item = {
  id: string;
  name: string;
  base_unit: string;
  pack_to_base_factor: number;
  last_price: number | null;
};
type Line = { itemId: string; qty: number };

export default function NewRecipe() {
  const [step, setStep] = useState(1); // 1: name/description, 2: ingredients, 3: yield/portions, 4: review
  const [tenantId, setTenantId] = useState<string|null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState<Line[]>([{ itemId: '', qty: 0 }]);
  const [yieldPct, setYieldPct] = useState<number>(1); // 1 = 100%
  const [portions, setPortions] = useState<number>(1);
  const [err, setErr] = useState<string|null>(null);
  const [ok, setOk] = useState<string|null>(null);

  useEffect(() => {
    (async () => {
      setErr(null);
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) { setErr('Not signed in'); return; }
      const { data: prof, error: pErr } = await supabase.from('profiles').select('tenant_id').eq('id', uid).maybeSingle();
      if (pErr || !prof?.tenant_id) { setErr(pErr?.message || 'No tenant. Visit /app to initialize.'); return; }
      setTenantId(prof.tenant_id);
      const { data, error } = await supabase
        .from('inventory_items')
        .select('id,name,base_unit,pack_to_base_factor,last_price')
        .order('name');
      if (error) setErr(error.message);
      setItems(data ?? []);
    })();
  }, []);

  const costs = useMemo(() => {
    const detailed = lines
      .filter(l => l.itemId && l.qty > 0)
      .map(l => {
        const it = items.find(i => i.id === l.itemId)!;
        const costPerBase = it?.last_price ? (Number(it.last_price) / Number(it.pack_to_base_factor)) : 0;
        const lineCost = costPerBase * Number(l.qty);
        return { it, qty: Number(l.qty), costPerBase, lineCost };
      });
    const batch = detailed.reduce((s,d)=>s+d.lineCost,0);
    const effective = yieldPct > 0 ? batch / yieldPct : batch;
    const perPortion = portions > 0 ? effective / portions : 0;
    return { detailed, batch, effective, perPortion };
  }, [lines, items, yieldPct, portions]);

  function setLine(i:number, patch:Partial<Line>) {
    setLines(prev => prev.map((l,idx)=> idx===i ? { ...l, ...patch } : l));
  }
  const addLine = () => setLines(prev => [...prev, { itemId:'', qty:0 }]);

  function next() {
    if (step === 1 && !name.trim()) { setErr('Give your recipe a name'); return; }
    if (step === 2 && !lines.some(l => l.itemId && l.qty>0)) { setErr('Add at least one ingredient'); return; }
    setErr(null); setStep(s => Math.min(4, s+1));
  }
  const back = () => setStep(s => Math.max(1, s-1));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setOk(null);
    if (!tenantId) { setErr('No tenant'); return; }
    const cleaned = lines.filter(l => l.itemId && l.qty>0);
    const { data: rec, error: rErr } = await supabase
      .from('recipes')
      .insert({
        tenant_id: tenantId,
        name: name.trim(),
        description: description.trim() || null,
        batch_yield_qty: portions,
        batch_yield_unit: 'each',
        yield_pct: yieldPct,
      })
      .select('id')
      .single();
    if (rErr) { setErr(rErr.message); return; }
    const payload = cleaned.map(l => {
      const it = items.find(i => i.id === l.itemId)!;
      return { recipe_id: rec.id, item_id: l.itemId, qty: Number(l.qty), unit: it.base_unit, sub_recipe_id: null };
    });
    const { error: iErr } = await supabase.from('recipe_ingredients').insert(payload);
    if (iErr) { setErr(iErr.message); return; }
    setOk('Recipe saved!');
    setStep(1); setName(''); setDescription(''); setLines([{ itemId:'', qty:0 }]);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">New Recipe</h1>
        <a className="underline" href="/recipes">← Back to list</a>
      </div>

      <div className="flex gap-2 text-sm">
        {[1,2,3,4].map(n => (
          <div key={n} className={`px-2 py-1 rounded ${n===step ? 'bg-neutral-800' : 'bg-neutral-900/60'}`}>
            {n === 1 && '1. Name & Description'}
            {n === 2 && '2. Ingredients'}
            {n === 3 && '3. Yield & Portions'}
            {n === 4 && '4. Review & Save'}
          </div>
        ))}
      </div>

      {err && <p className="text-red-500">{err}</p>}
      {ok && <p className="text-green-500">{ok}</p>}

      <form onSubmit={save} className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-4">
          {step === 1 && (
            <div className="border rounded p-4 space-y-3">
              <div>
                <label className="block text-sm mb-1">Recipe name</label>
                <input
                  className="border p-2 w-full"
                  placeholder="Recipe name"
                  value={name}
                  onChange={e=>setName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Recipe description (optional)</label>
                <textarea
                  className="border p-2 w-full min-h-28"
                  placeholder="Short description for staff/menu…"
                  value={description}
                  onChange={e=>setDescription(e.target.value)}
                />
              </div>
              <p className="text-xs text-neutral-400">
                This description appears on the recipe page and can be reused for menus if you like.
              </p>
            </div>
          )}

          {step === 2 && (
            <div className="border rounded p-4 space-y-3">
              <p className="text-sm text-neutral-300">Add ingredients. Quantities are in each item’s <b>base unit</b> (e.g., grams).</p>
              {lines.map((l,i) => {
                const it = items.find(x => x.id === l.itemId);
                const costPerBase = it?.last_price ? Number(it.last_price)/Number(it.pack_to_base_factor) : 0;
                const lineCost = it ? costPerBase * Number(l.qty||0) : 0;
                return (
                  <div key={i} className="grid grid-cols-8 gap-2 items-center">
                    <select className="border p-2 col-span-4" value={l.itemId} onChange={e=>setLine(i,{itemId:e.target.value})}>
                      <option value="">Select ingredient…</option>
                      {items.map(it => <option key={it.id} value={it.id}>{it.name}</option>)}
                    </select>
                    <input className="border p-2 col-span-2" type="number" step="0.0001" min="0"
                      placeholder="Qty" value={l.qty || ''} onChange={e=>setLine(i,{qty:Number(e.target.value)})}/>
                    <div className="text-xs col-span-1">{it?.base_unit ?? '—'}</div>
                    <div className="text-xs text-right col-span-1">{it ? `$${lineCost.toFixed(2)}` : '—'}</div>
                  </div>
                );
              })}
              <button type="button" className="border rounded px-3 py-1" onClick={addLine}>+ Add line</button>
            </div>
          )}

          {step === 3 && (
            <div className="border rounded p-4 grid grid-cols-2 gap-3">
              <label className="text-sm">Yield % (1 = 100%)</label>
              <input className="border p-2" type="number" step="0.01" min="0.01" max="1"
                value={yieldPct} onChange={e=>setYieldPct(Number(e.target.value))}/>
              <label className="text-sm">Portions</label>
              <input className="border p-2" type="number" min="1"
                value={portions} onChange={e=>setPortions(Number(e.target.value))}/>
              <p className="col-span-2 text-xs text-neutral-400">
                Tip: If you yield 10 portions and want to price per portion, set Portions = 10.
              </p>
            </div>
          )}

          {step === 4 && (
            <div className="border rounded p-4 space-y-3">
              <p className="text-sm">Review summary, then Save.</p>
              <ul className="text-sm list-disc pl-5">
                <li><b>Name:</b> {name || '—'}</li>
                <li><b>Description:</b> {description ? description.slice(0,120) : '—'}</li>
                <li><b>Ingredients:</b> {lines.filter(l=>l.itemId && l.qty>0).length}</li>
                <li><b>Yield %:</b> {yieldPct}</li>
                <li><b>Portions:</b> {portions}</li>
              </ul>
            </div>
          )}

          <div className="flex gap-2">
            {step > 1 && (
              <button
                type="button"
                className="border rounded px-4 py-2"
                onClick={back}
              >
                Back
              </button>
            )}
            {step < 4 ? (
              <button type="button" className="bg-black text-white rounded px-4 py-2" onClick={next}>Next</button>
            ) : (
              <button className="bg-black text-white rounded px-4 py-2">Save Recipe</button>
            )}
          </div>
        </div>

        <aside className="border rounded p-4 space-y-2 text-sm">
          <div className="font-semibold">Live Cost</div>
          <div>Batch: <b>${costs.batch.toFixed(2)}</b></div>
          <div>After yield: <b>${costs.effective.toFixed(2)}</b></div>
          <div>Per portion: <b>${costs.perPortion.toFixed(2)}</b></div>
          <hr className="my-2 border-neutral-800"/>
          <div className="font-semibold">Tips</div>
          {step === 1 && <p>Name it how your staff will recognize it quickly. Add a short description for staff/menu.</p>}
          {step === 2 && <p>Use base units (g/ml/each). We’ll handle conversions later.</p>}
          {step === 3 && <p>Yield <i>0.9</i> means 90% after trim/cook loss.</p>}
          {step === 4 && <p>Click Save. You’ll find this under Recipes → List.</p>}
        </aside>
      </form>
    </div>
  );
}
