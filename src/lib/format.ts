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

/**
 * Normalize recipe yield to a fraction in [0..1].
 * Accepts either fraction (e.g. 1.0 = 100%) or percent-style (e.g. 100 = 100%).
 * Defaults to 1 (100%) if missing/invalid.
 */
export function normYieldFraction(y?: number | null): number {
  const n = Number(y);
  if (!Number.isFinite(n) || n <= 0) return 1;
  // If it looks like a percent (e.g., 95 or 100), convert to 0..1
  return n > 1.5 ? n / 100 : n;
}
