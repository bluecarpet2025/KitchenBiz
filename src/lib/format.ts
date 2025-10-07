// src/lib/format.ts
// Server-safe money formatter (OK in both server & client files).
export const money = (n: number) =>
  (n ?? 0).toLocaleString(undefined, { style: "currency", currency: "USD" });
