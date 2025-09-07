import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { fmtUSD } from "@/lib/costing";

export const dynamic = "force-dynamic";

type CountRow = { id: string; note: string | null; created_at: string };
type LineRow = { count_id: string; item_id: string; delta_base: number | null };
type ReceiptRow = { item_id: string; total_cost_usd: number | null; qty_base: number | null };

async function getTenant() {
  const supabase = await createServerClient();
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id ?? null;
  if (!uid) return { supabase, tenantId: null };

  const { data: prof } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", uid)
    .maybeSingle();

  return { supabase, tenantId: prof?.tenant_id ?? null };
}

export default async function CountsListPage() {
  const { supabase, tenantId } = await getTenant();

  if (!tenantId) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Inventory Counts</h1>
        <p className="mt-4">Sign in required or profile missing tenant.</p>
        <Link className="underline" href="/login?redirect=/inventory/counts">Go to login</Link>
      </main>
    );
  }

  const { data: countsRaw } = await supabase
    .from("inventory_counts")
    .select("id, note, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  const counts: CountRow[] = (countsRaw ?? []) as any[];
  const countIds = counts.map((c) => c.id);

  const { data: linesRaw } = await supabase
    .from("inventory_count_lines")
    .select("count_id, item_id, delta_base")
    .eq("tenant_id", tenantId)
    .in("count_id", countIds);

  const lines: LineRow[] = (linesRaw ?? []) as any[];

  const { data: receiptsRaw } = await supabase
    .from("inventory_receipts")
    .select("item_id,total_cost_usd,qty_base")
    .eq("tenant_id", tenantId);

  const receipts: ReceiptRow[] = (receiptsRaw ?? []) as any[];

  const costAgg = new Map<string, { cost: number; qty: number }>();
  for (const r of receipts) {
    const id = r.item_id;
    const cost = Number(r.total_cost_usd || 0);
    const qty = Number(r.qty_base || 0);
    const a = costAgg.get(id) ?? { cost: 0, qty: 0 };
    a.cost += cost;
    a.qty += qty;
    costAgg.set(id, a);
  }
  const avgCost = new Map<string, number>();
  for (const [id, a] of costAgg.entries()) {
    avgCost.set(id, a.qty > 0 ? a.cost / a.qty : 0);
  }

  const totals = new Map<string, { units: number; dollars: number }>();
  for (const l of lines) {
    const cid = l.count_id;
    const delta = Math.abs(Number(l.delta_base || 0));
    if (!totals.has(cid)) totals.set(cid, { units: 0, dollars: 0 });
    const t = totals.get(cid)!;
    t.units += delta;
    t.dollars += delta * (avgCost.get(l.item_id) ?? 0);
  }

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Inventory Counts</h1>
        <div className="flex gap-2">
          <a
            href="/inventory/counts/export"
            className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
          >
            Export CSV
          </a>
          <Link
            href="/inventory/counts/new"
            className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
          >
            New Count
          </Link>
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm table-auto">
          <thead className="bg-neutral-900/60">
            <tr className="text-left text-neutral-300">
              <th className="p-2">When</th>
              <th className="p-2">Note</th>
              <th className="p-2 text-right">Total change (units)</th>
              <th className="p-2 text-right">Total change ($)</th>
            </tr>
          </thead>
          <tbody>
            {counts.length === 0 ? (
              <tr><td className="p-2" colSpan={4}>No counts yet.</td></tr>
            ) : (
              counts.map((r) => {
                const t = totals.get(r.id) ?? { units: 0, dollars: 0 };
                return (
                  <tr key={r.id} className="border-t hover:bg-neutral-900/30">
                    <td className="p-2">
                      <Link className="underline" href={`/inventory/counts/${r.id}`}>
                        {new Date(r.created_at).toLocaleString()}
                      </Link>
                    </td>
                    <td className="p-2">{r.note ?? ""}</td>
                    <td className="p-2 text-right tabular-nums">
                      {t.units === 0 ? "—" : t.units.toFixed(3)}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {t.dollars === 0 ? "—" : fmtUSD(t.dollars)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
