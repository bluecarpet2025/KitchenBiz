// src/app/inventory/counts/[id]/page.tsx
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { fmtUSD } from "@/lib/costing";
import { fmtQty } from "@/lib/format";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

type CountRow = {
  id: string;
  note: string | null;
  created_at: string;
  counted_at: string | null;
  status: string | null;
};

type LineRow = {
  id: string;
  item_id: string;
  expected_base: number;
  counted_base: number;
  delta_base: number;
  inventory_items: {
    name: string | null;
    base_unit: string | null;
  } | null;
};

async function getTenant() {
  const supabase = await createServerClient();
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id ?? null;
  if (!uid) return { supabase, tenantId: null, userId: null };

  const { data: prof } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", uid)
    .maybeSingle();

  return { supabase, tenantId: prof?.tenant_id ?? null, userId: uid };
}

export default async function CountDetailPage(props: PageProps) {
  const { id } = await props.params; // <- Next 15: params is a Promise
  const { supabase, tenantId } = await getTenant();

  if (!tenantId) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Inventory Count</h1>
        <p className="mt-4">Sign in required or profile missing tenant.</p>
        <Link className="underline" href="/inventory/counts">Back to counts</Link>
      </main>
    );
  }

  // Header
  const { data: c, error: cErr } = await supabase
    .from("inventory_counts")
    .select("id,note,created_at,counted_at,status")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();

  if (cErr || !c) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Inventory Count</h1>
        <p className="mt-4">Count not found.</p>
        <Link className="underline" href="/inventory/counts">Back to counts</Link>
      </main>
    );
  }
  const header = c as CountRow;

  // Lines (join for item name/unit)
  const { data: linesRaw } = await supabase
    .from("inventory_count_lines")
    .select(
      "id,item_id,expected_base,counted_base,delta_base,inventory_items(name,base_unit)"
    )
    .eq("tenant_id", tenantId)
    .eq("count_id", id)
    .order("id") as unknown as { data: LineRow[] | null };

  const lines: LineRow[] = (linesRaw ?? []).map((r) => ({
    ...r,
    expected_base: Number(r.expected_base ?? 0),
    counted_base: Number(r.counted_base ?? 0),
    delta_base: Number(r.delta_base ?? 0),
  }));

  // Avg $/base for each item
  const itemIds = Array.from(new Set(lines.map((l) => l.item_id)));
  let avgCostMap = new Map<string, number>();
  if (itemIds.length) {
    const { data: costs } = await supabase
      .from("v_item_avg_costs")
      .select("item_id, avg_cost_base")
      .eq("tenant_id", tenantId)
      .in("item_id", itemIds);

    avgCostMap = new Map(
      (costs ?? []).map((r: any) => [
        String(r.item_id),
        Number(r.avg_cost_base ?? 0),
      ])
    );
  }

  // Totals
  let totalCountedValue = 0;
  let totalChangeUnits = 0;
  let totalChangeValue = 0;

  const rows = lines.map((l) => {
    const name = l.inventory_items?.name ?? "—";
    const unit = l.inventory_items?.base_unit ?? "";
    const cost = avgCostMap.get(l.item_id) ?? 0;

    const lineValue = l.counted_base * cost;
    const changeUnits = l.delta_base;
    const changeValue = changeUnits * cost;

    totalCountedValue += lineValue;
    totalChangeUnits += changeUnits;
    totalChangeValue += changeValue;

    return {
      id: l.id,
      name,
      unit,
      cost,
      counted: l.counted_base,
      expected: l.expected_base,
      delta: changeUnits,
      lineValue,
      changeValue,
    };
  });

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Inventory Count</h1>
        <div className="flex items-center gap-2">
          <Link href="/inventory/counts" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
            Back to counts
          </Link>
          <Link href={`/inventory/counts/${header.id}/edit`} className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
            Edit
          </Link>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <div className="border rounded p-3">
          <div className="text-xs opacity-70">TOTAL COUNTED VALUE</div>
          <div className="text-xl font-semibold">{fmtUSD(totalCountedValue)}</div>
        </div>
        <div className="border rounded p-3">
          <div className="text-xs opacity-70">TOTAL CHANGE (UNITS)</div>
          <div className="text-xl font-semibold tabular-nums">
            {fmtQty(totalChangeUnits)}
          </div>
        </div>
        <div className="border rounded p-3">
          <div className="text-xs opacity-70">TOTAL CHANGE ($)</div>
          <div className="text-xl font-semibold">{fmtUSD(totalChangeValue)}</div>
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm table-auto">
          <thead className="bg-neutral-900/60">
            <tr className="text-left">
              <th className="p-2">Item</th>
              <th className="p-2 text-right">Qty</th>
              <th className="p-2">Unit</th>
              <th className="p-2 text-right">$ / base</th>
              <th className="p-2 text-right">Line value</th>
              <th className="p-2 text-right">Change (units)</th>
              <th className="p-2 text-right">Change value ($)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-2">{r.name}</td>
                <td className="p-2 text-right tabular-nums">{fmtQty(r.counted)}</td>
                <td className="p-2">{r.unit}</td>
                <td className="p-2 text-right tabular-nums">{fmtUSD(r.cost)}</td>
                <td className="p-2 text-right tabular-nums">{fmtUSD(r.lineValue)}</td>
                <td className={`p-2 text-right tabular-nums ${r.delta < 0 ? "text-red-500" : r.delta > 0 ? "text-emerald-500" : ""}`}>
                  {fmtQty(r.delta)}
                </td>
                <td className={`p-2 text-right tabular-nums ${r.changeValue < 0 ? "text-red-500" : r.changeValue > 0 ? "text-emerald-500" : ""}`}>
                  {fmtUSD(r.changeValue)}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="p-3 text-neutral-400" colSpan={7}>
                  No lines for this count.
                </td>
              </tr>
            )}
            {rows.length > 0 && (
              <tr className="border-t bg-neutral-900/30 font-medium">
                <td className="p-2">Totals</td>
                <td className="p-2 text-right tabular-nums">
                  {fmtQty(rows.reduce((a, b) => a + b.counted, 0))}
                </td>
                <td className="p-2"></td>
                <td className="p-2"></td>
                <td className="p-2 text-right tabular-nums">
                  {fmtUSD(totalCountedValue)}
                </td>
                <td className="p-2 text-right tabular-nums">
                  {fmtQty(totalChangeUnits)}
                </td>
                <td className="p-2 text-right tabular-nums">
                  {fmtUSD(totalChangeValue)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="text-xs opacity-70">
        {new Date(header.created_at).toLocaleString()} · {header.status ?? "draft"}
        {header.note ? <> · <span className="italic">{header.note}</span></> : null}
      </div>
    </main>
  );
}
