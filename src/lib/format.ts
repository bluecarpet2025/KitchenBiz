// src/lib/format.ts
// Formatting + parsing helpers shared across the app.

// Currency (USD)
export const fmtUSD = (n: number | null | undefined) =>
  Number(n ?? 0).toLocaleString(undefined, { style: "currency", currency: "USD" });

// Generic number with thousands separators
export const fmtNum = (n: number | null | undefined) =>
  Number(n ?? 0).toLocaleString();

// Quantities: show integers without decimals; otherwise up to 2 decimals trimmed.
export function fmtQty(n: number | null | undefined): string {
  const val = Number(n ?? 0);
  if (Number.isNaN(val)) return "0";
  if (Number.isInteger(val)) return String(val);
  // Up to 2 decimals, trim trailing zeros
  return trimZeros(val.toFixed(2));
}

function trimZeros(s: string): string {
  // "12.50" -> "12.5", "12.00" -> "12"
  if (!s.includes(".")) return s;
  return s.replace(/(\.\d*?[1-9])0+$|\.0+$/u, "$1");
}

/**
 * Parse strings like:
 *  - "0.5"        -> 0.5
 *  - "1/2"        -> 0.5
 *  - "1 1/2"      -> 1.5
 *  - "3"          -> 3
 * Falls back to NaN for unparseable input.
 */
export function parseFraction(input: string): number {
  const s = (input || "").trim();
  if (!s) return NaN;

  // Mixed number "a b/c"
  const mixed = /^(-?\d+)\s+(\d+)\/(\d+)$/u.exec(s);
  if (mixed) {
    const whole = Number(mixed[1]);
    const num = Number(mixed[2]);
    const den = Number(mixed[3] || 1);
    if (den === 0) return NaN;
    return whole + num / den * Math.sign(whole || 1);
  }

  // Simple fraction "a/b"
  const frac = /^(-?\d+)\/(\d+)$/u.exec(s);
  if (frac) {
    const num = Number(frac[1]);
    const den = Number(frac[2] || 1);
    if (den === 0) return NaN;
    return num / den;
  }

  // Plain number
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Normalizes a “yield fraction” to a usable numeric multiplier.
 * Accepts numbers (e.g., 1.25), or strings like "1/2", "1 1/2", "0.75".
 * On invalid/empty input, returns 1.
 */
export function normYieldFraction(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const n = parseFraction(value);
    return Number.isFinite(n) && n > 0 ? n : 1;
  }
  return 1;
}
