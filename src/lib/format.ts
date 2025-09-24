// src/lib/format.ts
// Small formatting helpers used across pages.

export const fmtUSD = (n: number) =>
  Number(n ?? 0).toLocaleString(undefined, { style: "currency", currency: "USD" });

// (optional) plain number with thousands separators
export const fmtNum = (n: number) =>
  Number(n ?? 0).toLocaleString();
