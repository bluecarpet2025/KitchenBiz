// src/lib/db.ts
import type { SupabaseClient, PostgrestError } from "@supabase/supabase-js";

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Fetch a single aggregate from a view for a period key.
 * - view: e.g. "v_sales_month_totals"
 * - periodField: "day" | "week" | "month" | "year"
 * - periodValue: e.g. "2025-09-19", "2025-W38", "2025-09", "2025"
 * - column: e.g. "revenue" (sales) or "total" (expenses)
 */
export async function sumOne(
  supabase: SupabaseClient<any, "public", any>,
  view: string,
  periodField: "day" | "week" | "month" | "year",
  periodValue: string,
  tenantId: string,
  column: string
): Promise<number> {
  const { data, error } = await supabase
    .from(view)
    .select(column)
    .eq("tenant_id", tenantId)
    .eq(periodField, periodValue)
    .maybeSingle();

  // Ignore "no rows" (PGRST116), log anything else
  const pgErr = error as PostgrestError | null;
  if (pgErr && pgErr.code !== "PGRST116") {
    console.error(`sumOne(${view}) error`, pgErr);
  }
  return num(data?.[column]);
}

/**
 * 7-day series (inclusive) for a day-based view.
 * Returns { labels, values }.
 */
export async function daySeries(
  supabase: SupabaseClient<any, "public", any>,
  view: string,
  tenantId: string,
  since: string, // YYYY-MM-DD
  column: string
): Promise<{ labels: string[]; values: number[] }> {
  const { data, error } = await supabase
    .from(view)
    .select(`day, ${column}`)
    .eq("tenant_id", tenantId)
    .gte("day", since) // "day" is DATE in our views
    .order("day", { ascending: true });

  if (error) {
    console.error(`daySeries(${view}) error`, error);
    return { labels: [], values: [] };
  }

  const labels = (data ?? []).map((r: any) => String(r.day));
  const values = (data ?? []).map((r: any) => num(r[column]));
  return { labels, values };
}

/* ---------- date helpers ---------- */

export const todayStr = (d?: Date) =>
  (d ?? new Date()).toISOString().slice(0, 10); // YYYY-MM-DD

export const monthStr = (d: Date) => d.toISOString().slice(0, 7); // YYYY-MM

export const yearStr = (d: Date) => String(d.getUTCFullYear());

export const weekStr = (d: Date) => {
  // ISO week string YYYY-Www
  const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  dt.setUTCDate(dt.getUTCDate() + 4 - (dt.getUTCDay() || 7)); // Thursday
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((+dt - +yearStart) / 86400000 + 1) / 7);
  return `${dt.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
};

export const addDays = (d: Date, n: number) => {
  const c = new Date(d);
  c.setUTCDate(c.getUTCDate() + n);
  return c;
};
