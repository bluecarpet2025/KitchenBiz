// src/lib/metrics.ts
import { SupabaseClient } from "@supabase/supabase-js";

type AmountCol = "revenue" | "total";
type PeriodCol = "day" | "week" | "month" | "year";

export async function sumOne(
  supabase: SupabaseClient,
  view: string,
  periodCol: PeriodCol,
  key: string,
  tenantId: string,
  amountCol: AmountCol
): Promise<number> {
  const { data, error } = await supabase
    .from(view)
    .select(`${amountCol}`)
    .eq("tenant_id", tenantId)
    .eq(periodCol, key)
    .maybeSingle();

  if (error) return 0;
  const raw = (data as any)?.[amountCol];
  return typeof raw === "number" ? raw : Number(raw ?? 0);
}

export async function daySeries(
  supabase: SupabaseClient,
  view: string,
  tenantId: string,
  startDay: string,
  amountCol: AmountCol
): Promise<Array<{ day: string; amount: number }>> {
  const { data, error } = await supabase
    .from(view)
    .select(`day, ${amountCol}`)
    .eq("tenant_id", tenantId)
    .gte("day", startDay)
    .order("day", { ascending: true });

  if (error || !data) return [];
  return (data as any[]).map((r) => ({
    day: r.day,
    amount: Number(r[amountCol] ?? 0),
  }));
}
