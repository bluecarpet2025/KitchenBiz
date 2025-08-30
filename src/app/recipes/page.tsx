// src/app/recipes/page.tsx
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { getEffectiveTenant } from "@/lib/effective-tenant";

export const dynamic = "force-dynamic";

type RecipeRow = {
  id: string;
  name: string | null;
  created_at: string | null;
  batch_yield_qty: number | null;
  batch_yield_unit: string | null;
  yield_pct: number | null;
};
type IngredientRow = {
  id: string;
  recipe_id: string;
  item_id: string | null;
  sub_recipe_id: string | null;
  qty: number | null;
  unit: string | null;
};

function indexIngredients(lines: IngredientRow[]) {
  const map = new Map<string, IngredientRow[]>();
  for (const l of lines) {
    if (!l.recipe_id) continue;
    if (!map.has(l.recipe_id)) map.set(l.recipe_id, []);
    map.get(l.recipe_id)!.push(l);
  }
  return map;
}

function buildRequirementsIndex(
  recipes: RecipeRow[],
  linesByRecipe: Map<string, IngredientRow[]>
): Record<string, Record<string, number>> {
  const recipeById = new Map(recipes.map(r => [r.id, r]));
  const memo = new Map<string, Record<string, number>>();
  const visiting = new Set<string>();
  const MAX_DEPTH = 32;

  function addInto(dst: Record<string, number>, src: Record<string, number>, multiplier = 1) {
    for (const [k, v] of Object.entries(src)) {
      dst[k] = (dst[k] ?? 0) + v * multiplier;
    }
  }

  function dfs(recipeId: string, depth = 0): Record<string, number> {
    if (memo.has(recipeId)) return memo.get(recipeId)!;
    if (visiting.has(recipeId) || depth > MAX_DEPTH) {
      const zero: Record<string, number> = {};
      memo.set(recipeId, zero);
      return zero;
    }
    visiting.add(recipeId);

    const out: Record<string, number> = {};
    const parts = linesByRecipe.get(recipeId) ?? [];
    for (const line of parts) {
      const qty = Number(line.qty ?? 0);
      if (!qty || qty <= 0) continue;
      if (line.item_id) {
        const itemId = String(line.item_id);
        out[itemId] = (out[itemId] ?? 0) + qty;
      } else if (line.sub_recipe_id) {
        const subId = String(line.sub_recipe_id);
        const subReq = dfs(subId, depth + 1);
        addInto(out, subReq, qty);
      }
    }

    const yieldPct = Number(recipeById.get(recipeId)?.yield_pct ?? 1) || 1;
    const scale = yieldPct > 0 ? 1 / yieldPct : 1;
    if (scale !== 1) for (const k of Object.keys(out)) out[k] *= scale;

    memo.set(recipeId, out);
    visiting.delete(recipeId);
    return out;
  }

  for (const r of recipes) dfs(r.id, 0);
  return Object.fromEntries(memo.entries());
}

export default async function RecipesPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Recipes</h1>
        <p className="mt-4">Sign in required.</p>
        <Link href="/login?redirect=/recipes" className="underline">Go to login</Link>
      </main>
    );
  }

  // 🔵 only change: use effective tenant
  const tenantId = await getEffectiveTenant(supabase);
  if (!tenantId) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Recipes</h1>
        <p className="mt-4">Profile missing tenant.</p>
      </main>
    );
  }

  const { data: recipesRaw, error: rErr } = await supabase
    .from("recipes")
    .select("id,name,created_at,batch_yield_qty,batch_yield_unit,yield_pct")
    .eq("tenant_id", tenantId)
    .order("name");
  if (rErr) throw rErr;
  const recipes = (recipesRaw ?? []) as RecipeRow[];

  const recipeIds = recipes.map(r => r.id);
  let ingredients: IngredientRow[] = [];
  if (recipeIds.length) {
    const { data: ingRaw, error: iErr } = await supabase
      .from("recipe_ingredients")
      .select("id,recipe_id,item_id,sub_recipe_id,qty,unit")
      .in("recipe_id", recipeIds);
    if (iErr) throw iErr;
    ingredients = (ingRaw ?? []) as IngredientRow[];
  }

  // On hand (new view)
  const onhandMap = new Map<string, number>();
  let onHandRows = 0;
  try {
    const { data: ohNew, error: ohNewErr } = await supabase
      .from("v_inventory_on_hand")
      .select("item_id,qty_on_hand_base")
      .eq("tenant_id", tenantId);
    if (ohNewErr) throw ohNewErr;
    (ohNew ?? []).forEach((r: any) => {
      onhandMap.set(r.item_id as string, Number(r.qty_on_hand_base ?? 0));
    });
    onHandRows = (ohNew ?? []).length;
  } catch {
    const { data: ohOld } = await supabase
      .from("v_item_on_hand")
      .select("item_id,on_hand_base")
      .eq("tenant_id", tenantId);
    (ohOld ?? []).forEach((r: any) => {
      onhandMap.set(r.item_id as string, Number(r.on_hand_base ?? 0));
    });
    onHandRows = (ohOld ?? []).length;
  }

  const linesByRecipe = indexIngredients(ingredients);
  const reqIndex = buildRequirementsIndex(recipes, linesByRecipe);

  const rows = recipes.map((rec) => {
    const req = reqIndex[rec.id] ?? {};
    const itemIds = Object.keys(req);
    if (itemIds.length === 0) {
      return {
        id: rec.id,
        name: rec.name ?? "Untitled",
        created_at: rec.created_at,
        makeable: 0,
      };
    }
    let minPossible = Infinity;
    for (const itId of itemIds) {
      const needed = Number(req[itId] ?? 0);
      if (needed <= 0) continue;
      const onHand = onhandMap.get(itId) ?? 0;
      const possible = Math.floor(onHand / needed);
      if (possible < minPossible) minPossible = possible;
    }
    const makeable = Number.isFinite(minPossible) ? minPossible : 0;
    return {
      id: rec.id,
      name: rec.name ?? "Untitled",
      created_at: rec.created_at,
      makeable,
    };
  });

  const onHandEmpty = onHandRows === 0;

  return (
    <main className="max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Recipes</h1>
        <Link
          href="/recipes/new"
          className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
        >
          New Recipe
        </Link>
      </div>

      <div className="mt-4 border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900/60">
            <tr>
              <th className="text-left p-2">Recipe</th>
              <th className="text-right p-2">Makeable</th>
              <th className="text-left p-2">Created</th>
              <th className="text-left p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-t">
                <td className="p-2">
                  <Link href={`/recipes/${r.id}`} className="underline">
                    {r.name}
                  </Link>
                </td>
                <td className="p-2 text-right tabular-nums">{r.makeable}</td>
                <td className="p-2">
                  {r.created_at ? new Date(r.created_at).toLocaleDateString() : "-"}
                </td>
                <td className="p-2">
                  <Link href={`/recipes/${r.id}?dup=1`} className="underline">Duplicate</Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="p-3 text-neutral-400">No recipes yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs mt-3 opacity-70">
        <strong>Makeable</strong> expands sub-recipes into base items and uses your current on-hand (base units) to estimate how many portions you can prep now.
      </p>
      {onHandEmpty && (
        <p className="text-xs mt-1 text-amber-300">
          No on-hand data found for your items. Add stock in{" "}
          <Link href="/inventory/counts/new" className="underline">Inventory → Counts</Link> or{" "}
          <Link href="/inventory/purchase" className="underline">Inventory → Purchase</Link>.
        </p>
      )}
    </main>
  );
}
