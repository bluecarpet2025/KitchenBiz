'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { costPerBaseUnit } from '@/lib/costing';

type RI = { id: string; item_id: string | null; sub_recipe_id: string | null; qty: number | null; unit: string | null };
type Item = {
  id: string; name: string;
  base_unit: string; purchase_unit: string;
  pack_to_base_factor: number | null;
  last_price: number | null;
};

export default function RecipeDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [recipe, setRecipe] = useState<any>(null);
  const [ings, setIngs] = useState<RI[]>([]);
  const [itemsById, setItemsById] = useState<Record<string, Item>>({});

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr(null);
      const id = params.id;

      // recipe (grab everything so we can be flexible about column names)
      const { data: r, error: rErr } = await supabase
        .from('recipes')
        .select('*')
        .eq('id', id)
        .single();
      if (rErr) { setErr(rErr.message); setLoading(false); return; }
      setRecipe(r);

      // ingredients
      const { data: ris, error: iErr } = await supabase
        .from('recipe_ingredients')
        .select('id,item_id,sub_recipe_id,qty,unit')
        .eq('recipe_id', id)
        .order('id');
      if (iErr) { setErr(iErr.message); setLoading(false); return; }
      const list = (ris ?? []) as RI[];
      setIngs(list);

      // fetch inventory items used
      const itemIds = Array.from(new Set(list.map(x => x.item_id).filter(Boolean))) as string[];
      if (itemIds.length) {
        const { data: its, error: itErr } = await supabase
          .from('inventory_items')
          .select('id,name,base_unit,purchase_unit,pack_to_base_factor,last_price')
          .in('id', itemIds);
        if (itErr) { setErr(itErr.message); setLoading(false); return; }
        const map: Record<string, Item> = {};
        (its ?? []).forEach((it: any) => { map[it.id] = it as Item; });
        setItemsById(map);
      }

      setLoading(false);
    })();
  }, [params.id]);

  // Flexible fallbacks
  const portions: number = recipe?.portions ?? recipe?.servings ?? recipe?.portion_qty ?? 1;
  const portionUnit: string = recipe?.portion_unit ?? recipe?.serving_unit ?? recipe?.unit ?? 'each';
  const yieldPct: number = recipe?.yield_pct ?? recipe?.yield ?? 1;

  const rows = useMemo(() => {
    return ings.map(ri => {
      const it = ri.item_id ? itemsById[ri.item_id] : undefined;
      const qty = Number(ri.qty ?? 0);
      const perServingQty = portions ? (qty * yieldPct) / portions : qty;

      let unitCost = 0;
      let baseUnit = it?.base_unit ?? ri.unit ?? '';
      if (it?.last_price && it?.pack_to_base_factor) {
        unitCost = costPerBaseUnit(Number(it.last_price), Number(it.pack_to_base_factor));
      }
      const costPerServing = unitCost * perServingQty;

      return {
        name: it?.name ?? '(missing item)',
        totalQty: qty,
        perServingQty,
        baseUnit,
        costPerServing,
      };
    });
  }, [ings, itemsById, portions, yieldPct]);

  const batchCost = rows.reduce((s, r) => s + r.costPerServing * (portions || 1), 0);
  const effectiveBatch = yieldPct ? batchCost / yieldPct : batchCost;
  const costPerServing = portions ? effectiveBatch / portions : 0;

  if (loading) return null;
  if (err) return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Recipe</h1>
        <a className="underline text-sm" onClick={() => router.back()}>← Back</a>
      </div>
      <p className="text-red-500">{err}</p>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header with Edit + Back */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{recipe?.name}</h1>
        <div className="flex items-center gap-2">
          <Link
            href={`/recipes/${params.id}/edit`}
            className="border rounded px-3 py-1 hover:bg-neutral-900"
            title="Edit this recipe"
          >
            Edit
          </Link>
          <Link className="underline text-sm" href="/recipes">← Back to list</Link>
        </div>
      </div>

      {/* stat cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="border rounded p-4">
          <div className="text-sm opacity-75">Portions</div>
          <div className="text-lg font-medium">{portions} {portionUnit}</div>
          <div className="text-sm opacity-75">Yield %: {Math.round(yieldPct * 100)}%</div>
        </div>
        <div className="border rounded p-4">
          <div className="text-sm opacity-75">Batch cost</div>
          <div className="text-lg font-medium">${batchCost.toFixed(2)}</div>
          <div className="text-sm opacity-75">Effective (after yield): ${effectiveBatch.toFixed(2)}</div>
        </div>
        <div className="border rounded p-4">
          <div className="text-sm opacity-75">Cost per serving</div>
          <div className="text-lg font-medium">${costPerServing.toFixed(2)}</div>
        </div>
      </div>

      {/* ingredients table */}
      <div>
        <h2 className="font-semibold mb-2">Ingredients (per serving)</h2>
        <table className="table-cozy w-full text-sm table-auto border-separate border-spacing-y-1">
          <thead>
            <tr className="text-left text-neutral-300">
              <th>Ingredient</th>
              <th>Total Qty</th>
              <th>Per Serving</th>
              <th>Base Unit</th>
              <th>Cost / Serving</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="bg-neutral-950/60 rounded">
                <td className="px-3 py-2 rounded-l">{r.name}</td>
                <td className="px-3 py-2">{r.totalQty.toFixed(3)}</td>
                <td className="px-3 py-2">{r.perServingQty.toFixed(3)}</td>
                <td className="px-3 py-2">{r.baseUnit}</td>
                <td className="px-3 py-2 rounded-r">${r.costPerServing.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs opacity-70 mt-2">
          Quantities are shown in each item’s base unit (e.g., grams). Costs use current inventory prices.
        </p>
      </div>
    </div>
  );
}
