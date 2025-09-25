// src/lib/metrics.ts
import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Notes:
 * - Our Postgres views already filter by tenant via tenant_for_select().
 * - We keep `tenantId` in the signature for backward compatibility, but it is not used.
 */
type AmountCol = "revenue" | "total";
type PeriodCol = "day" | "week" | "month" | "year";

export async function sumOne(
  supabase: SupabaseClient,
  view: string,
  periodCol: PeriodCol,
  key: string,
  _tenantId: string, // unused (views handle tenant)
  amountCol: AmountCol
): Promise<number> {
  const { data, error } = await supabase
    .from(view)
    .select(`${amountCol}`)
    .eq(periodCol, key)
    .maybeSingle();

  if (error) return 0;
  const raw = (data as any)?.[amountCol];
  return typeof raw === "number" ? raw : Number(raw ?? 0);
}

export async function daySeries(
  supabase: SupabaseClient,
  view: string,
  _tenantId: string, // unused (views handle tenant)
  startDay: string,
  amountCol: AmountCol
): Promise<Array<{ day: string; amount: number }>> {
  const { data, error } = await supabase
    .from(view)
    .select(`day, ${amountCol}`)
    .gte("day", startDay)
    .order("day", { ascending: true });

  if (error || !data) return [];
  return (data as any[]).map((r) => ({
    day: String(r.day),
    amount: Number(r[amountCol] ?? 0),
  }));
}
