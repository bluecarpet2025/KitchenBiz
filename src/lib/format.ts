// src/lib/format.ts
// All helpers here are SERVER-SAFE (no “use client”, no browser-only APIs).

/** Currency formatter used across server/client files. */
export const money = (n: number) =>
  (n ?? 0).toLocaleString(undefined, { style: "currency", currency: "USD" });

/**
 * Quantity formatter for inventory/recipes.
 * - Keeps small numbers readable (<= 1 shows up to 3 decimals)
 * - Larger numbers show up to 2 decimals
 * - Trims trailing zeros.
 */
export function fmtQty(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return "0";
  const abs = Math.abs(v);
  const str =
    abs < 1
      ? v.toFixed(3)
      : abs < 100
      ? v.toFixed(2)
      : Math.round(v).toString();
  return str.replace(/\.?0+$/, "");
}

/**
 * Normalize a “yield” value (recipe yields / portions) into a fraction (0..1).
 * Accepts:
 *  - number (already 0..1 or >1 as ratio -> clamp to [0,1])
 *  - "75%" -> 0.75
 *  - "3/4" -> 0.75
 *  - "1.25" -> 1 (clamped)
 *  - invalid -> 0
 */
export function normYieldFraction(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.min(1, value));
  }
  if (typeof value === "string") {
    const s = value.trim();
    // percent e.g. "75%"
    const pct = s.match(/^(-?\d+(?:\.\d+)?)\s*%$/);
    if (pct) {
      const v = parseFloat(pct[1]) / 100;
      return Math.max(0, Math.min(1, v));
    }
    // fraction e.g. "3/4"
    const frac = s.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
    if (frac) {
      const num = parseFloat(frac[1]);
      const den = parseFloat(frac[2]);
      if (Number.isFinite(num) && Number.isFinite(den) && den !== 0) {
        return Math.max(0, Math.min(1, num / den));
      }
      return 0;
    }
    // plain number string
    const f = parseFloat(s);
    if (Number.isFinite(f)) {
      return Math.max(0, Math.min(1, f));
    }
  }
  return 0;
}
