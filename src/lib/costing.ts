// Minimal costing helpers used by Inventory & Recipes pages

/** Price per ONE base unit.
 * Example: last_price = $8.00 per 1 kg, pack_to_base_factor = 1000 (g/kg)
 * → costPerBaseUnit = 8 / 1000 = $0.008 per gram
 */
export function costPerBaseUnit(last_price: number | null | undefined, pack_to_base_factor: number | null | undefined): number {
  const price = Number(last_price ?? 0);
  const factor = Number(pack_to_base_factor ?? 0);
  if (!isFinite(price) || !isFinite(factor) || factor <= 0) return 0;
  return price / factor;
}

/** Cost for a quantity expressed in base units. */
export function costForBaseQty(qtyInBase: number | null | undefined, unitCost: number | null | undefined): number {
  const q = Number(qtyInBase ?? 0);
  const c = Number(unitCost ?? 0);
  if (!isFinite(q) || !isFinite(c)) return 0;
  return q * c;
}

/** Round to 2 decimals for money math. */
export function roundMoney(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Format a number as $x.xx (safe for undefined). */
export function formatMoney(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  if (!isFinite(v)) return "$0.00";
  return `$${v.toFixed(2)}`;
}
