// src/lib/costing.ts

export type Recipe = {
  id: string;
  batch_yield_qty: number | null;
  yield_pct: number | null;
};

export type IngredientRow = {
  recipe_id: string;
  item_id: string;
  qty: number | null; // in item base units
};

export type ItemCostRow = {
  id: string;
  last_price: number | null;
  pack_to_base_factor: number | null;
};

/** Safe number */
function n(v: number | null | undefined) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

/** $ per base unit from last purchase */
export function costPerBaseUnit(
  lastPrice: number | null | undefined,
  packToBaseFactor: number | null | undefined
) {
  const price = n(lastPrice);
  const factor = n(packToBaseFactor);
  if (price <= 0 || factor <= 0) return 0;
  return price / factor;
}

/** qty of an ingredient used per *serving* after batch yield and yield% */
export function qtyPerServing(
  ingQtyBase: number | null | undefined,
  recipeBatchYieldQty: number | null | undefined,
  recipeYieldPct: number | null | undefined
) {
  const qty = n(ingQtyBase);
  const batch = n(recipeBatchYieldQty) || 1;
  const ypct = n(recipeYieldPct) || 1;
  // earlier logic: perServing = qty * yieldPct / batchYieldQty
  return batch > 0 ? (qty * (ypct || 1)) / batch : qty;
}

/** Cost per portion (serving) of a recipe. */
export function costPerPortion(
  recipe: Recipe,
  ingredients: IngredientRow[],
  itemCostById: Record<string, number>
) {
  const batch = n(recipe.batch_yield_qty) || 1;
  const ypct = n(recipe.yield_pct) || 1;

  let total = 0;
  for (const ing of ingredients) {
    const perServing = qtyPerServing(ing.qty, batch, ypct);
    const unitCost = itemCostById[ing.item_id] || 0;
    total += perServing * unitCost;
  }
  return total; // $ per portion
}

/** Price suggestion from cost and target food-cost pct (e.g. 0.30). */
export function priceFromCost(costPerPortion: number, foodPct = 0.3) {
  const pct = foodPct > 0 ? foodPct : 0.3;
  const price = costPerPortion / pct;
  // Round to nearest 0.05 for nicer prices
  return Math.round(price / 0.05) * 0.05;
}
