'use client';
export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { costPerServing, fmtUSD, suggestedPrice } from '@/lib/costing';

type RecipeRow = {
  id: string;
  name: string | null;
  created_at: string | null;
  batch_yield_qty: number | null;
  batch_yield_unit: string | null;
  yield_pct: number | null;
};
type IngredientRow = { recipe_id: string; item_id: string; qty: number | null };
type ItemRow = { id: string; name: string | null; last_price: number | null; pack_to_base_factor: number | null };

export default function RecipesPage() {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [recipes, setRecipes] = useState<RecipeRow[]>([]);
  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);
  const [itemsById, setItemsById] = useState<Record<string, ItemRow>>({});
  const [targetPct, setTargetPct] = useState<number>(() => {
    const saved = localStorage.getItem('targetFoodPct');
    return saved ? Number(saved) : 0.30;
  });
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem('targetFoodPct', String(targetPct));
  }, [targetPct]);

  useEffect(() => {
    (async () => {
      try {
        const { data: u } = await supabase.auth.getUser();
        const uid = u.user?.id;
        if (!uid) { setStatus('Sign in required.'); return; }

        const { data: prof } = await supabase.from('profiles').select('tenant_id').eq('id', uid).maybeSingle();
        if (!prof?.tenant_id) { setStatus('No tenant.'); return; }
        setTenantId(prof.tenant_id);

        const { data: recs } = await supabase
          .from('recipes')
          .select('id,name,created_at,batch_yield_qty,batch_yield_unit,yield_pct')
          .eq('tenant_id', prof.tenant_id)
          .order('name');
        setRecipes((recs ?? []) as RecipeRow[]);

        const rids = (recs ?? []).map((r: any) => r.id);
        const { data: ings } = await supabase
          .from('recipe_ingredients')
          .select('recipe_id,item_id,qty')
          .in('recipe_id', rids);
        setIngredients((ings ?? []) as IngredientRow[]);

        const itemIds = Array.from(new Set((ings ?? []).map((i: any) => i.item_id)));
        if (itemIds.length) {
          const { data: items } = await supabase
            .from('inventory_items')
            .select('id,name,last_price,pack_to_base_factor')
            .in('id', itemIds);
          const map: Record<string, ItemRow> = {};
          (items ?? []).forEach((it: any) => { map[it.id] = it as ItemRow; });
          setItemsById(map);
        }
      } catch (e: any) {
        setStatus(e?.message ?? 'Error loading recipes');
      }
    })();
  }, []);

  const ingByRecipe = useMemo(() => {
    const m = new Map<string, IngredientRow[]>();
    for (const row of ingredients) {
      if (!m.has(row.recipe_id)) m.set(row.recipe_id, []);
      m.get(row.recipe_id)!.push(row);
    }
    return m;
  }, [ingredients]);

  const rows = useMemo(() => {
    return recipes.map(rec => {
      const parts = ingByRecipe.get(rec.id) ?? [];
      const cps = costPerServing({ recipe: rec, ingredients: parts, itemsById });
      return {
        id: rec.id,
        name: rec.name ?? 'Untitled',
        created_at: rec.created_at,
        costPerServing: cps,
        suggested: suggestedPrice(cps, targetPct),
      };
    });
  }, [recipes, ingByRecipe, itemsById, targetPct]);

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Recipes</h1>
        <Link
          href="/recipes/new"
          className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
        >
          New Recipe
        </Link>
      </div>

      {/* Pricing controls */}
      <div className="border rounded-lg p-4 flex items-center gap-4">
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
        <div className="text-sm opacity-70">Suggested price = cost ÷ target%</div>
      </div>

      {status && <p className="text-sm text-rose-400">{status}</p>}

      <div className="mt-2 border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900/60">
            <tr>
              <th className="text-left p-2">Recipe</th>
              <th className="text-right p-2">Cost / serving</th>
              <th className="text-right p-2">Suggested price</th>
              <th className="text-left p-2">Created</th>
              <th className="text-left p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-t">
                <td className="p-2">
                  <Link href={`/recipes/${r.id}`} className="underline">{r.name}</Link>
                </td>
                <td className="p-2 text-right tabular-nums">{fmtUSD(r.costPerServing)}</td>
                <td className="p-2 text-right tabular-nums">{fmtUSD(r.suggested)}</td>
                <td className="p-2">{r.created_at ? new Date(r.created_at).toLocaleDateString() : '-'}</td>
                <td className="p-2">
                  <Link href={`/recipes/${r.id}?dup=1`} className="underline mr-3">Duplicate</Link>
                  <Link href={`/recipes/${r.id}`} className="underline">Open</Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="p-3 text-neutral-400">No recipes yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
