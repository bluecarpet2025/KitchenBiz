// src/app/recipes/[id]/page.tsx
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { getEffectiveTenant } from "@/lib/effective-tenant";
import { fmtQty } from "@/lib/format";

export const dynamic = "force-dynamic";

type RecipeRow = {
  id: string;
  tenant_id: string;
  name: string | null;
  description?: string | null;
  batch_yield_qty: number | null;
  batch_yield_unit: string | null;
  yield_pct: number | null;
  created_at?: string | null;
};

type IngredientRow = {
  id: string;
  recipe_id: string;
  item_id: string | null;
  sub_recipe_id: string | null;
  qty: number | null;
  unit: string | null;
};

type ItemRow = {
  id: string;
  name: string | null;
  base_unit: string | null;
};

// Normalize 0..1 or 0..100 into fraction (default 1)
function normYieldFraction(y?: number | null): number {
  const n = Number(y ?? 1);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return n > 1.5 ? n / 100 : n;
}

function indexByRecipe(lines: IngredientRow[]) {
  const map = new Map<string, IngredientRow[]>();
  for (const l of lines) {
    if (!l.recipe_id) continue;
    if (!map.has(l.recipe_id)) map.set(l.recipe_id, []);
    map.get(l.recipe_id)!.push(l);
  }
  return map;
}

/**
 * Expand sub-recipes → base items, producing required base qty per 1 batch.
 * This matches the makeable logic used on the recipes list.
 */
function buildRequirementsIndex(
  recipes: RecipeRow[],
  byRecipe: Map<string, IngredientRow[]>
): Record<string, Record<string, number>> {
  const recipeById = new Map(recipes.map((r) => [r.id, r]));
  const memo = new Map<string, Record<string, number>>();
  const visiting = new Set<string>();
  const MAX_DEPTH = 32;

  function addInto(dst: Record<string, number>, src: Record<string, number>, mult = 1) {
    for (const [k, v] of Object.entries(src)) dst[k] = (dst[k] ?? 0) + v * mult;
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
    const parts = byRecipe.get(recipeId) ?? [];
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

    // Apply yield as a scale-up from finished portions to required inputs
    const yf = normYieldFraction(recipeById.get(recipeId)?.yield_pct ?? 1);
    const scale = yf > 0 ? 1 / yf : 1;
    if (scale !== 1) for (const k of Object.keys(out)) out[k] *= scale;

    memo.set(recipeId, out);
    visiting.delete(recipeId);
    return out;
  }

  for (const r of recipes) dfs(r.id, 0);
  return Object.fromEntries(memo.entries());
}

export default async function RecipeDetailPage({
  params,
}: {
  // ✅ Next 15 expects params as a Promise — await it.
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createServerClient();
  const tenantId = await getEffectiveTenant(supabase);

  if (!tenantId) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Recipe</h1>
        <p className="mt-4">Profile missing tenant.</p>
        <Link href="/recipes" className="underline">
          Back to recipes
        </Link>
      </main>
    );
  }

  // --- 1) Load the recipe
  const { data: recipe, error: rErr } = await supabase
    .from("recipes")
    .select("id,tenant_id,name,description,batch_yield_qty,batch_yield_unit,yield_pct,created_at")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();

  if (rErr || !recipe) {
    return (
      <main className="max-w-5xl mx-auto p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Recipe</h1>
          <Link href="/recipes" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
            Back to recipes
          </Link>
        </div>
        <p className="text-red-400">
          Couldn’t load recipe (id {id}). {rErr?.message ?? "Not found."}
        </p>
      </main>
    );
  }

  // --- 2) Load this recipe’s ingredient lines
  const { data: ingRaw, error: iErr } = await supabase
    .from("recipe_ingredients")
    .select("id,recipe_id,item_id,sub_recipe_id,qty,unit")
    .eq("recipe_id", id);

  if (iErr) {
    return (
      <main className="max-w-5xl mx-auto p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Recipe</h1>
          <Link href="/recipes" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
            Back to recipes
          </Link>
        </div>
        <p className="text-red-400">Couldn’t load ingredients. {iErr.message}</p>
      </main>
    );
  }

  const lines: IngredientRow[] = (ingRaw ?? []) as IngredientRow[];

  // For display names/units
  const itemIds = lines.filter(l => l.item_id).map(l => String(l.item_id));
  const subIds = lines.filter(l => l.sub_recipe_id).map(l => String(l.sub_recipe_id));

  const itemsById = new Map<string, ItemRow>();
  if (itemIds.length) {
    const { data: items } = await supabase
      .from("inventory_items")
      .select("id,name,base_unit")
      .in("id", Array.from(new Set(itemIds)));
    (items ?? []).forEach((it: any) => itemsById.set(it.id, it as ItemRow));
  }

  const subRecipesById = new Map<string, RecipeRow>();
  if (subIds.length) {
    const { data: subs } = await supabase
      .from("recipes")
      .select("id,tenant_id,name,batch_yield_qty,batch_yield_unit,yield_pct")
      .in("id", Array.from(new Set(subIds)));
    (subs ?? []).forEach((sr: any) => subRecipesById.set(sr.id, sr as RecipeRow));
  }

  // --- 3) Compute “makeable (batches)” for this recipe (same rules as list)
  // Pull all recipes + all ingredients to build the requirements index
  let makeable = 0;
  {
    const { data: allRecipes } = await supabase
      .from("recipes")
      .select("id,tenant_id,name,batch_yield_qty,batch_yield_unit,yield_pct")
      .eq("tenant_id", tenantId);

    const allIds = (allRecipes ?? []).map(r => r.id);
    let allLines: IngredientRow[] = [];
    if (allIds.length) {
      const { data: allIngs } = await supabase
        .from("recipe_ingredients")
        .select("id,recipe_id,item_id,sub_recipe_id,qty,unit")
        .in("recipe_id", allIds);
      allLines = (allIngs ?? []) as IngredientRow[];
    }

    // On-hand (prefer new view; fallback to old)
    const onhandMap = new Map<string, number>();
    let onHandRows = 0;
    try {
      const { data: ohNew, error: ohErr } = await supabase
        .from("v_inventory_on_hand")
        .select("item_id,qty_on_hand_base")
        .eq("tenant_id", tenantId);
      if (ohErr) throw ohErr;
      (ohNew ?? []).forEach((r: any) => onhandMap.set(r.item_id as string, Number(r.qty_on_hand_base ?? 0)));
      onHandRows = (ohNew ?? []).length;
    } catch {
      const { data: ohOld } = await supabase
        .from("v_item_on_hand")
        .select("item_id,on_hand_base")
        .eq("tenant_id", tenantId);
      (ohOld ?? []).forEach((r: any) => onhandMap.set(r.item_id as string, Number(r.on_hand_base ?? 0)));
      onHandRows = (ohOld ?? []).length;
    }

    if (onHandRows > 0 && (allRecipes?.length ?? 0) > 0) {
      const byRecipe = indexByRecipe(allLines);
      const reqIndex = buildRequirementsIndex(allRecipes as RecipeRow[], byRecipe);
      const req = reqIndex[id] ?? {};
      const itemIdsNeeded = Object.keys(req);
      if (itemIdsNeeded.length === 0) {
        makeable = 0;
      } else {
        let minPossible = Infinity;
        for (const itId of itemIdsNeeded) {
          const needed = Number(req[itId] ?? 0);
          if (needed <= 0) continue;
          const have = onhandMap.get(itId) ?? 0;
          const possible = Math.floor(have / needed);
          if (possible < minPossible) minPossible = possible;
        }
        makeable = Number.isFinite(minPossible) ? minPossible : 0;
      }
    }
  }

  // --- 4) Presentable rows for this recipe’s ingredients
  const displayRows = lines.map((l) => {
    if (l.item_id) {
      const it = itemsById.get(String(l.item_id));
      return {
        kind: "item" as const,
        name: it?.name ?? "(item)",
        qty: Number(l.qty ?? 0),
        unit: l.unit ?? it?.base_unit ?? "",
        baseQty: Number(l.qty ?? 0), // our quantities are already in base units
        baseUnit: it?.base_unit ?? "",
      };
    } else if (l.sub_recipe_id) {
      const sr = subRecipesById.get(String(l.sub_recipe_id));
      return {
        kind: "sub" as const,
        name: sr?.name ?? "(sub-recipe)",
        qty: Number(l.qty ?? 0),
        unit: l.unit ?? "each",
        baseQty: Number(l.qty ?? 0),
        baseUnit: "each",
      };
    } else {
      return {
        kind: "unknown" as const,
        name: "(unknown)",
        qty: Number(l.qty ?? 0),
        unit: l.unit ?? "",
        baseQty: Number(l.qty ?? 0),
        baseUnit: "",
      };
    }
  });

  // Sort by ingredient name for stability
  displayRows.sort((a, b) => a.name.localeCompare(b.name));

  const yieldPctView = Math.round(normYieldFraction(recipe.yield_pct) * 100);

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{recipe.name ?? "Untitled recipe"}</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/recipes"
            className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
          >
            Back to recipes
          </Link>
          <Link
            href={`/recipes/${recipe.id}/edit`}
            className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
          >
            Edit
          </Link>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <div className="border rounded-lg p-3">
          <div className="text-xs opacity-75">Batch yield</div>
          <div className="text-xl font-semibold">
            {fmtQty(Number(recipe.batch_yield_qty ?? 0))}{" "}
            {recipe.batch_yield_unit ?? ""}
          </div>
        </div>
        <div className="border rounded-lg p-3">
          <div className="text-xs opacity-75">Yield %</div>
          <div className="text-xl font-semibold">{yieldPctView}%</div>
        </div>
        <div className="border rounded-lg p-3">
          <div className="text-xs opacity-75">Makeable (batches)</div>
          <div className="text-xl font-semibold tabular-nums">{fmtQty(makeable)}</div>
        </div>
      </div>

      {recipe.description ? (
        <div className="border rounded-lg p-3">{recipe.description}</div>
      ) : null}

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900/60">
            <tr>
              <th className="p-2 text-left">Ingredient</th>
              <th className="p-2 text-right">Qty</th>
              <th className="p-2 text-left">Unit</th>
              <th className="p-2 text-right">Base qty</th>
              <th className="p-2 text-left">Base unit</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((r, i) => (
              <tr key={`${r.name}-${i}`} className="border-t">
                <td className="p-2">{r.name}</td>
                <td className="p-2 text-right tabular-nums">{fmtQty(r.qty)}</td>
                <td className="p-2">{r.unit || ""}</td>
                <td className="p-2 text-right tabular-nums">{fmtQty(r.baseQty)}</td>
                <td className="p-2">{r.baseUnit || ""}</td>
              </tr>
            ))}
            {displayRows.length === 0 && (
              <tr>
                <td className="p-3 text-neutral-400" colSpan={5}>
                  No ingredients yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs opacity-70">
        Makeable expands sub-recipes into base items and compares required base
        quantities to your current on-hand.
      </p>
    </main>
  );
}
