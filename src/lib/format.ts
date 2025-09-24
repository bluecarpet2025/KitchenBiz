// --- append to: src/lib/format.ts ---
export function fmtQty(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === "") return "—";
  const v = typeof n === "string" ? Number(n) : n;
  return Number.isFinite(v) ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(n);
}

export function normYieldFraction(v: number | string | null | undefined): number {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return v;
  const s = v.trim();
  if (/^\d+\s*\/\s*\d+$/.test(s)) {
    const [a, b] = s.split("/").map(Number);
    return b ? a / b : 0;
  }
  if (s.includes("%")) return Number(s.replace("%", "")) / 100;
  return Number(s);
}
