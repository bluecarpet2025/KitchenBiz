// src/lib/costing.ts

/** Always return a safe number */
function n(v: unknown, def = 0): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : def;
}

/** USD formatter */
export function fmtUSD(v: number): string {
  try {
    return v.toLocaleString("en-US", { style: "currency", currency: "USD" });
  } catch {
    return `$${v.toFixed(2)}`;
  }
}

/** $ per base unit (e.g., $/gram, $/ml, $/piece) */
export function costPerBaseUnit(
  lastPrice?: number | null,
  packToBaseFactor?: number | null
): number {
  const price = n(lastPrice, 0);
  const factor = n(packToBaseFactor, 1);
  if (factor <= 0) return 0;
  return price / factor;
}

/** Suggested selling price from cost and margin % (e.g., 30 => 30%) */
export function suggestedPrice(cost: number, marginPct = 30): number {
  const m = n(marginPct, 0) / 100;
  if (m >= 1) return cost; // avoid div by zero / infinity
  return cost / (1 - m);
}

/** Types used by calculators */
export type RecipeLike = {
  batch_yield_qty: number | null;
  yield_pct: number | null; // 0..1 (null => 1)
};

export type IngredientLine = {
  item_id: string;
  /** qty in the item base unit for the whole batch */
  qty: number | null;
};

/** Cost per serving */
export function costPerServing(
  recipe: RecipeLike,
  ingredients: IngredientLine[],
  itemCostById: Record<string, number>
): number;
export function costPerServing(args: {
  recipe: RecipeLike;
  ingredients: IngredientLine[];
  itemCostById: Record<string, number>;
}): number;
export function costPerServing(
  a:
    | RecipeLike
    | {
        recipe: RecipeLike;
        ingredients: IngredientLine[];
        itemCostById: Record<string, number>;
      },
  b?: IngredientLine[],
  c?: Record<string, number>
): number {
  let recipe: RecipeLike;
  let ingredients: IngredientLine[];
  let itemCostById: Record<string, number>;

  if (typeof a === "object" && "recipe" in a) {
    recipe = a.recipe;
    ingredients = a.ingredients;
    itemCostById = a.itemCostById;
  } else {
    recipe = a as RecipeLike;
    ingredients = b ?? [];
    itemCostById = c ?? {};
  }

  const batchQty = n(recipe.batch_yield_qty, 1);
  const yieldPct = recipe.yield_pct == null ? 1 : n(recipe.yield_pct, 1);
  const effectiveBatch = Math.max(1e-9, batchQty * yieldPct);

  let totalPerServing = 0;
  for (const line of ingredients) {
    const perBatchQty = n(line.qty, 0); // already base units
    const perServingQty = perBatchQty / effectiveBatch;
    const unitCost = n(itemCostById[line.item_id], 0);
    totalPerServing += perServingQty * unitCost;
  }
  return totalPerServing;
}

/* ------------------------------------------------------------------
   Backwards‑compat aliases so older files keep compiling:
   - costPerPortion   -> costPerServing
   - priceFromCost    -> suggestedPrice
   - IngredientRow    -> IngredientLine
   - ItemCostRow      -> a simple { item_id, unit_cost } shape (rarely used)
   - Recipe           -> RecipeLike
-------------------------------------------------------------------*/
export const costPerPortion = costPerServing;
export const priceFromCost = suggestedPrice;

export type IngredientRow = IngredientLine;
export type ItemCostRow = { item_id: string; unit_cost: number };
export type Recipe = RecipeLike;
