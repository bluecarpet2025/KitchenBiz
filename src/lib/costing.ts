// src/lib/costing.ts

/** Safe number */
export function num(x: any, fallback = 0): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

/** USD formatter */
export function fmtUSD(n: number): string {
  if (!Number.isFinite(n)) n = 0;
  return `$${n.toFixed(2)}`;
}

/**
 * Base-unit cost for an inventory item.
 * last_price = price per *purchase pack*
 * pack_to_base_factor = how many base units in one purchase pack
 * -> cost per base unit = last_price / pack_to_base_factor
 */
export function baseUnitCost(item?: { last_price: number | null; pack_to_base_factor: number | null }): number {
  if (!item) return 0;
  const price = num(item.last_price, 0);
  const pack = Math.max(1, num(item.pack_to_base_factor, 1));
  return price / pack;
}

/**
 * Compute cost per serving for a recipe.
 * - ingredients qty is per *batch*
 * - per-serving qty = (qty * yieldPct) / batchQty
 * - line cost = perServingQty * baseUnitCost(item)
 */
export function costPerServing(opts: {
  recipe?: { batch_yield_qty: number | null; yield_pct: number | null };
  ingredients: Array<{ item_id: string; qty: number | null }>;
  itemsById: Record<string, { last_price: number | null; pack_to_base_factor: number | null }>;
}): number {
  const r = opts.recipe || { batch_yield_qty: 1, yield_pct: 1 };
  const batchQty = Math.max(1, num(r.batch_yield_qty, 1));
  const yieldPct = num(r.yield_pct, 1) || 1;

  let total = 0;
  for (const row of opts.ingredients) {
    const perServingQty = (num(row.qty, 0) * yieldPct) / batchQty;
    const item = opts.itemsById[row.item_id];
    const buCost = baseUnitCost(item);
    total += perServingQty * buCost;
  }
  return total;
}

/** Suggested price from target food cost % (e.g., 0.30) */
export function suggestedPrice(costPerServing: number, targetFoodPct: number): number {
  const pct = Math.max(0.01, Math.min(0.99, targetFoodPct || 0.3));
  return costPerServing / pct;
}
