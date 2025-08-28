// src/lib/format.ts
/**
 * Format a quantity up to 3 decimals, but hide trailing zeros.
 * - 6000      -> "6,000"
 * - 12.5      -> "12.5"
 * - 3.250     -> "3.25"
 * - 1.2349    -> "1.235" (rounded)
 */
export function fmtQty(n: number | null | undefined): string {
  if (n == null || Number.isNaN(Number(n))) return "—";
  const rounded = Math.round(Number(n) * 1000) / 1000; // keep 3dp
  const asInt = Math.round(rounded);
  const isWhole = Math.abs(rounded - asInt) < 1e-12;

  return isWhole
    ? asInt.toLocaleString()
    : rounded.toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 3,
      });
}
