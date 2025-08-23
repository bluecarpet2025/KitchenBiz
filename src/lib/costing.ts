// src/lib/costing.ts
// Shared pricing/costing helpers + light types that both client/server can import.

export type ItemCostById = Record<string, number>; // inventory_items.id -> cost per BASE unit

export type RecipeLike = {
  id: string;
  name?: string | null;
  batch_yield_qty?: number | null;    // how many portions a batch makes
  batch_yield_unit?: string | null;   // not used for math, only display elsewhere
  yield_pct?: number | null;          // loss (trim/cook) multiplier, e.g. 0.9
  menu_description?: string | null;
};

export type IngredientLine = {
  recipe_id?: string | null;
  item_id?: string | null;
  qty?: number | null;                // quantity of the base unit consumed per portion
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
 * Compute **raw cost per portion** for a recipe.
 * We assume `ingredients` quantities are expressed in base units per **one portion**.
 * If your data is per-batch, make sure you pre-divide by portions elsewhere.
 */
export function costPerPortion(
  recipe: RecipeLike,
  ingredients: IngredientLine[],
  itemCostById: ItemCostById
): number {
  const loss = (recipe.yield_pct ?? 1) || 1; // if 0 or null -> treat as 1
  // basic sum of cost of each ingredient qty * unit cost
  const raw = (ingredients ?? []).reduce((sum, line) => {
    const itemId = String(line.item_id ?? '');
    const qty = Number(line.qty ?? 0);
    const unit = itemCostById[itemId] ?? 0;
    return sum + qty * unit;
  }, 0);
  // account for yield loss (if yield_pct < 1, cost goes up slightly)
  return raw / (loss > 0 ? loss : 1);
}

/**
 * Convert a raw **cost** to a **selling price** given a FOOD‑COST percent.
 * Example: cost = 0.59, foodCostPct = 0.30 -> price ≈ 1.966...
 * (because cost / price = 0.30  ⇒  price = cost / 0.30)
 */
export function priceFromCost(cost: number, foodCostPct: number): number {
  const c = Math.max(0, Number(cost) || 0);
  const f = Math.min(0.95, Math.max(0.05, Number(foodCostPct) || 0.3)); // clamp 5–95%
  return f > 0 ? c / f : c;
}

/**
 * Round a price to a “psychological” ending (.00, .49, .79, .99, etc).
 * ending must be in [0, 1). Example 0.99 → $X.99 ; 0.49 → $X.49
 */
export function roundToEnding(price: number, ending: number): number {
  const p = Math.max(0, Number(price) || 0);
  const e = Math.max(0, Math.min(0.99, Number(ending) || 0));
  const whole = Math.floor(p);               // drop decimals
  if (p <= whole + e) return whole + e;      // already below/at the target edge for this dollar
  return whole + 1 + e;                      // bump to next dollar, add ending
}
