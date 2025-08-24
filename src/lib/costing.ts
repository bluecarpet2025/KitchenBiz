// src/lib/costing.ts
// Shared pricing/costing helpers + light types that both client/server can import.

export type ItemCostById = Record<string, number>; // inventory_items.id -> cost per BASE unit

export type RecipeLike = {
  id: string;
  name?: string | null;
  batch_yield_qty?: number | null;    // how many portions a batch makes (display only here)
  batch_yield_unit?: string | null;   // display only
  yield_pct?: number | null;          // loss (trim/cook) multiplier, e.g. 0.9
  menu_description?: string | null;
};

export type IngredientLine = {
  id?: string;
  recipe_id?: string | null;
  // exactly one of item_id or sub_recipe_id should be set:
  item_id?: string | null;            // inventory item
  sub_recipe_id?: string | null;      // another recipe (cost-per-portion)
  qty?: number | null;                // quantity per ONE portion of the parent recipe
  unit?: string | null;               // display only
};

// nice currency
export function fmtUSD(n: number): string {
  if (!Number.isFinite(n)) return '$0.00';
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

/**
 * Convert a last purchase price for a packaged item into **cost per base unit**.
 * lastPrice: price you paid for the package
 * packToBaseFactor: how many "base units" you get from that package
 */
export function costPerBaseUnit(lastPrice: number, packToBaseFactor: number): number {
  const price = Number(lastPrice) || 0;
  const factor = Number(packToBaseFactor) || 0;
  if (price <= 0 || factor <= 0) return 0;
  return price / factor;
}

/**
 * Convert a raw **cost** to a **selling price** given a FOOD COST percent.
 * Example: cost = 0.59, foodCostPct = 0.30 -> price ≈ 1.966...
 * (because cost / price = 0.30  ⇒  price = cost / 0.30)
 */
export function priceFromCost(cost: number, foodCostPct: number): number {
  const c = Math.max(0, Number(cost) || 0);
  const f = Math.min(0.95, Math.max(0.05, Number(foodCostPct) || 0.3)); // clamp 5–95%
  return f > 0 ? c / f : c;
}

/**
 * Round a price to a “psychological” ending (.00, .49, .79, .89, .95, .99).
 * ending must be in [0, 1). Example 0.99 → $X.99 ; 0.49 → $X.49
 */
export function roundToEnding(price: number, ending: number): number {
  const p = Math.max(0, Number(price) || 0);
  const e = Math.max(0, Math.min(0.99, Number(ending) || 0));
  const whole = Math.floor(p);               // drop decimals
  if (p <= whole + e) return whole + e;      // already below/at the target edge for this dollar
  return whole + 1 + e;                      // bump to next dollar, add ending
}

/**
 * Legacy: compute **raw cost per portion** for a recipe considering only inventory items.
 * (Kept for reference; not used when sub-recipes exist.)
 */
export function costPerPortion(
  recipe: RecipeLike,
  ingredients: IngredientLine[],
  itemCostById: ItemCostById
): number {
  const loss = (recipe.yield_pct ?? 1) || 1; // if 0 or null -> treat as 1
  const raw = (ingredients ?? []).reduce((sum, line) => {
    const itemId = String(line.item_id ?? '');
    const qty = Number(line.qty ?? 0);
    const unit = itemCostById[itemId] ?? 0;
    return sum + qty * unit;
  }, 0);
  return raw / (loss > 0 ? loss : 1);
}

/**
 * Build an index of **raw cost per portion** for every recipe, supporting sub-recipes.
 * - ingredients.qty is measured per ONE portion of the parent recipe.
 * - If an ingredient is a sub-recipe, we multiply qty * cost(sub-recipe).
 * - Each recipe’s own yield_pct is applied at the end: raw / yield_pct (if provided).
 * - Cycles are guarded; any cycle will contribute 0 to avoid infinite recursion.
 */
export function buildRecipeCostIndex(
  recipes: RecipeLike[],
  ingLines: IngredientLine[],
  itemCostById: ItemCostById
): Record<string, number> {
  const recipeById = new Map<string, RecipeLike>();
  recipes.forEach(r => recipeById.set(String(r.id), r));

  const ingByRecipe = new Map<string, IngredientLine[]>();
  for (const l of ingLines ?? []) {
    const rid = String(l.recipe_id ?? '');
    if (!rid) continue;
    if (!ingByRecipe.has(rid)) ingByRecipe.set(rid, []);
    ingByRecipe.get(rid)!.push(l);
  }

  const memo = new Map<string, number>();
  const visiting = new Set<string>();
  const MAX_DEPTH = 32;

  function dfs(recipeId: string, depth = 0): number {
    if (memo.has(recipeId)) return memo.get(recipeId)!;
    if (visiting.has(recipeId) || depth > MAX_DEPTH) {
      // cycle or too deep – treat as zero to avoid infinite loops
      memo.set(recipeId, 0);
      return 0;
    }
    visiting.add(recipeId);

    const recipe = recipeById.get(recipeId);
    const lines = ingByRecipe.get(recipeId) ?? [];

    let raw = 0;
    for (const line of lines) {
      const qty = Number(line.qty ?? 0);
      if (!qty || qty <= 0) continue;

      if (line.item_id) {
        const unit = itemCostById[String(line.item_id)] ?? 0;
        raw += qty * unit;
      } else if (line.sub_recipe_id) {
        const subId = String(line.sub_recipe_id);
        const subCost = dfs(subId, depth + 1); // cost per portion of sub-recipe
        raw += qty * subCost;
      }
    }

    const loss = recipe?.yield_pct ?? 1;
    const finalCost = raw / (loss && loss > 0 ? loss : 1);

    memo.set(recipeId, finalCost);
    visiting.delete(recipeId);
    return finalCost;
  }

  for (const r of recipes) {
    dfs(String(r.id), 0);
  }
  return Object.fromEntries(memo.entries());
}
