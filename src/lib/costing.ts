// src/lib/costing.ts

/** ---- Shared types ------------------------------------------------------ */

export type ItemCostById = Record<string, number>;

export type RecipeLike = {
  id: string;
  name: string | null;
  batch_yield_qty: number | null;    // e.g. 8 slices
  batch_yield_unit: string | null;   // e.g. "slice"
  yield_pct: number | null;          // 0-1 loss factor (null => 1)
  menu_description?: string | null;
};

export type IngredientLine = {
  recipe_id: string | null;
  item_id: string | null;
  qty: number | null;                // qty in the inventory item’s base unit
};

/** ---- Utilities --------------------------------------------------------- */

export function fmtUSD(n: number): string {
  if (!isFinite(n)) return '$0.00';
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

/**
 * Convert a purchase price for a pack to the cost for ONE base unit.
 * Ex: last_price=$12.00 for a case, pack_to_base_factor=24 → $0.50 each.
 */
export function costPerBaseUnit(lastPrice?: number | null, packToBase?: number | null): number {
  const price = Number(lastPrice ?? 0);
  const factor = Number(packToBase ?? 0);
  if (price <= 0 || factor <= 0) return 0;
  return price / factor;
}

/**
 * Raw food cost PER SERVING/PORTION for a recipe.
 * - `recipe.batch_yield_qty` tells how many servings a full batch yields
 * - `yield_pct` (0..1) is an optional waste/shrink factor (defaults to 1)
 * - Sums ingredient extended costs using `itemCostById`
 */
export function costPerPortion(
  recipe: RecipeLike,
  ingredients: IngredientLine[],
  itemCostById: ItemCostById
): number {
  const yieldQty = Number(recipe.batch_yield_qty ?? 0);
  if (yieldQty <= 0) return 0;

  const shrink = clamp01(recipe.yield_pct ?? 1);

  let batchCost = 0;
  for (const line of ingredients) {
    const id = line.item_id ?? '';
    const unitCost = itemCostById[id] ?? 0;
    const qty = Number(line.qty ?? 0);
    if (unitCost > 0 && qty > 0) batchCost += unitCost * qty;
  }

  // Adjust for yield (if 80% yield, effective usable is 0.8)
  const effectiveBatchCost = batchCost / (shrink > 0 ? shrink : 1);
  return effectiveBatchCost / yieldQty;
}

/**
 * Selling price from raw food cost and a food‑cost percentage (margin).
 * If margin = 0.30, then price = cost / 0.30 (NOT cost * 1.30).
 */
export function priceFromCost(rawCost: number, margin: number): number {
  const m = clamp01(margin);
  if (rawCost <= 0 || m <= 0) return 0;
  return rawCost / m;
}

/** ---- helpers ----------------------------------------------------------- */
function clamp01(n: number) {
  if (!isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
