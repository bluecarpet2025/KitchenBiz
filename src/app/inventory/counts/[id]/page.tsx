// src/app/inventory/counts/[id]/page.tsx
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { fmtUSD, costPerBaseUnit } from "@/lib/costing";

export const dynamic = "force-dynamic";

type Count = {
  id: string;
  tenant_id: string;
  counted_at: string | null;
  status: string | null;
  note: string | null;
  created_at: string | null;
};

type Line = {
  item_id: string;
  counted_qty: number;
};

type Item = {
  id: string;
  name: string;
  base_unit: string;
  last_price: number | null;
  pack_to_base_factor: number | null;
};

type Adj = {
  item_id: string;
  delta_base: number;
};

async function getTenantAndCount(id: string) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, ok: false, reason: "Sign in required" as const };

  const { data: prof } = await supabase
    .from("profiles").select("tenant_id").eq("id", user.id).maybeSingle();
  const tenantId = prof?.tenant_id ?? null;
  if (!tenantId) return { supabase, ok: false, reason: "No tenant" as const };

  const { data: count } = await supabase
    .from("inventory_counts")
    .select("id,tenant_id,counted_at,status,note,created_at")
    .eq("id", id)
    .maybeSingle();

  if (!count || count.tenant_id !== tenantId) {
    return { supabase, ok: false, reason: "Count not found" as const };
  }

  return { supabase, ok: true as const, tenantId, count: count as Count };
}

export default async function CountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const g = await getTenantAndCount(id);
  if (!g.ok) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Inventory Count</h1>
        <p className="mt-4">{g.reason}</p>
        <Link href="/inventory/counts" className="underline">Back to counts</Link>
      </main>
    );
  }
  const { supabase, tenantId, count } = g;

  const [{ data: linesRaw }, { data: itemsRaw }, { data: adjsRaw }] = await Promise.all([
    supabase.from("inventory_count_lines").select("item_id,counted_qty").eq("count_id", id),
    supabase.from("inventory_items").select("id,name,base_unit,last_price,pack_to_base_factor").eq("tenant_id", tenantId),
    supabase.from("inventory_adjustments").select("item_id,delta_base").eq("ref_count_id", id),
  ]);

  const lines = (linesRaw ?? []) as Line[];
  const items = (itemsRaw ?? []) as Item[];
  const adjMap = new Map<string, number>();
  (adjsRaw ?? []).forEach((a: any) => adjMap.set(a.item_id as string, Number(a.delta_base ?? 0)));

  const itemById = new Map(items.map(i => [i.id, i]));
  const rows = lines.map(l => {
    const it = itemById.get(l.item_id)!;
    const unitCost = costPerBaseUnit(Number(it?.last_price ?? 0), Number(it?.pack_to_base_factor ?? 0));
    const lineValue = unitCost * Number(l.counted_qty ?? 0);
    const deltaUnits = adjMap.get(l.item_id) ?? null;
    const deltaValue = deltaUnits == null ? null : unitCost * Math.abs(deltaUnits);
    return {
      item_id: l.item_id,
      name: it?.name ?? "(unknown)",
      unit: it?.base_unit ?? "",
      qty: Number(l.counted_qty ?? 0),
      unitCost,
      lineValue,
      deltaUnits,
      deltaValue,
    };
  });

  const totals = rows.reduce(
    (acc, r) => {
      acc.counted += r.lineValue;
      acc.absDeltaUnits += Math.abs(r.deltaUnits ?? 0);
      acc.absDeltaValue += Number(r.deltaValue ?? 0);
      return acc;
    },
    { counted: 0, absDeltaUnits: 0, absDeltaValue: 0 }
  );

  const when = count.counted_at ?? count.created_at ?? "";

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Inventory Count</h1>
        <div className="text-sm opacity-70">
          {when ? new Date(when).toLocaleString() : ""} {count.status ? `– ${count.status}` : ""}
        </div>
        {count.note && <div className="text-sm mt-1">{count.note}</div>}
      </div>

      <div className="flex gap-3">
        <Link href="/inventory/counts" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">Back to counts</Link>
        <Link href={`/inventory/counts/${count.id}/edit`} className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">Edit</Link>
      </div>

      {/* KPI tiles with plain-language labels */}
      <div className="grid md:grid-cols-3 gap-4">
        <div className="border rounded p-3">
          <div className="text-xs uppercase opacity-70">Total counted value</div>
          <div className="text-xl font-semibold tabular-nums">{fmtUSD(totals.counted)}</div>
        </div>
        <div className="border rounded p-3">
          <div className="text-xs uppercase opacity-70">Total change (units)</div>
          <div className="text-xl font-semibold tabular-nums">{totals.absDeltaUnits.toFixed(3)}</div>
        </div>
        <div className="border rounded p-3">
          <div className="text-xs uppercase opacity-70">Total change ($)</div>
          <div className="text-xl font-semibold tabular-nums">{fmtUSD(totals.absDeltaValue)}</div>
        </div>
      </div>

      <div className="border rounded overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-neutral-300">
            <tr>
              <th className="p-2 text-left">Item</th>
              <th className="p-2 text-right">Qty</th>
              <th className="p-2">Unit</th>
              <th className="p-2 text-right">$ / base</th>
              <th className="p-2 text-right">Line value</th>
              <th className="p-2 text-right">Change (units)</th>
              <th className="p-2 text-right">Change value ($)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.item_id} className="border-t">
                <td className="p-2">{r.name}</td>
                <td className="p-2 text-right tabular-nums">{r.qty.toFixed(3)}</td>
                <td className="p-2">{r.unit}</td>
                <td className="p-2 text-right tabular-nums">{fmtUSD(r.unitCost)}</td>
                <td className="p-2 text-right tabular-nums">{fmtUSD(r.lineValue)}</td>
                <td className="p-2 text-right tabular-nums">{r.deltaUnits == null ? "—" : r.deltaUnits.toFixed(3)}</td>
                <td className="p-2 text-right tabular-nums">{r.deltaValue == null ? "—" : fmtUSD(r.deltaValue)}</td>
              </tr>
            ))}
            <tr className="border-t font-medium">
              <td className="p-2">Totals</td>
              <td className="p-2" />
              <td className="p-2" />
              <td className="p-2" />
              <td className="p-2 text-right tabular-nums">{fmtUSD(totals.counted)}</td>
              <td className="p-2 text-right tabular-nums">{totals.absDeltaUnits.toFixed(3)}</td>
              <td className="p-2 text-right tabular-nums">{fmtUSD(totals.absDeltaValue)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </main>
  );
}
