// src/app/inventory/counts/[id]/page.tsx
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { fmtUSD } from "@/lib/costing";
import { fmtQty } from "@/lib/format";

export const dynamic = "force-dynamic";

type LineAny = {
  // Minimal, tolerant shape for the view
  count_id: string;
  item_id: string;
  item_name: string | null;
  base_unit: string | null;
  expected_base?: number | null;
  counted_base?: number | null;
  delta_base?: number | null;
  // cost column name may vary by view; we’ll read whichever exists
  unit_cost_base?: number | null;
  avg_cost_base?: number | null;
  avg_per_base?: number | null;
  avg_cost_per_base?: number | null;
};

function pickCostPerBase(row: LineAny): number {
  return Number(
    row.unit_cost_base ??
      row.avg_cost_base ??
      row.avg_per_base ??
      row.avg_cost_per_base ??
      0
  );
}

export default async function CountDetailPage({
  params,
}: {
  // Next 15 server components receive params as a Promise
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerClient();

  // 1) Try the detailed view first (preferred)
  let lines: LineAny[] = [];
  const { data: vlines, error: vErr } = await supabase
    .from("v_count_lines_detailed")
    .select(
      "count_id,item_id,item_name,base_unit,expected_base,counted_base,delta_base,unit_cost_base,avg_cost_base,avg_per_base,avg_cost_per_base"
    )
    .eq("count_id", id)
    .order("item_name", { ascending: true });

  if (!vErr && vlines) {
    lines = vlines as LineAny[];
  } else {
    // 2) Fallback to raw lines + enrich lightly so the page still renders
    const { data: raw, error: rawErr } = await supabase
      .from("inventory_count_lines")
      .select("count_id,item_id,expected_base,counted_base,delta_base")
      .eq("count_id", id);

    if (rawErr) {
      // Hard failure: show a friendly message
      return (
        <main className="max-w-5xl mx-auto p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold">Inventory Count</h1>
            <Link
              href="/inventory/counts"
              className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
            >
              Back to counts
            </Link>
          </div>
          <p className="text-red-400">
            Couldn’t load count lines (id {id}). {rawErr.message}
          </p>
        </main>
      );
    }

    // Pull minimal item info for names/units
    const itemIds = Array.from(new Set((raw ?? []).map((r: any) => r.item_id)));
    let itemsById = new Map<string, { name: string; base_unit: string | null }>();
    if (itemIds.length) {
      const { data: items } = await supabase
        .from("inventory_items")
        .select("id,name,base_unit")
        .in("id", itemIds);
      (items ?? []).forEach((it: any) =>
        itemsById.set(it.id, { name: it.name, base_unit: it.base_unit })
      );
    }

    lines = (raw ?? []).map((r: any) => {
      const info = itemsById.get(r.item_id) ?? { name: "(item)", base_unit: null };
      return {
        count_id: r.count_id,
        item_id: r.item_id,
        item_name: info.name,
        base_unit: info.base_unit,
        expected_base: Number(r.expected_base ?? 0),
        counted_base: Number(r.counted_base ?? 0),
        delta_base: Number(r.delta_base ?? 0),
        unit_cost_base: 0, // no cost in fallback
      } as LineAny;
    });
    // Sort by name for consistency
    lines.sort((a, b) => (a.item_name ?? "").localeCompare(b.item_name ?? ""));
  }

  // Aggregate totals (values based on cost per base)
  let totalCountedValue = 0;
  let totalDeltaUnits = 0;
  let totalDeltaValue = 0;

  const viewRows = lines.map((r) => {
    const qty = Number(r.counted_base ?? 0);
    const delta = Number(r.delta_base ?? 0);
    const price = pickCostPerBase(r); // $ per base unit
    const lineValue = qty * price;
    const changeValue = delta * price;

    totalCountedValue += lineValue;
    totalDeltaUnits += delta;
    totalDeltaValue += changeValue;

    return {
      name: r.item_name ?? "(item)",
      qty,
      unit: r.base_unit ?? "",
      price,
      lineValue,
      delta,
      changeValue,
    };
  });

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Inventory Count</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/inventory/counts"
            className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
          >
            Back to counts
          </Link>
          <Link
            href={`/inventory/counts/${id}/edit`}
            className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
          >
            Edit
          </Link>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <div className="border rounded-lg p-3">
          <div className="text-xs opacity-75">TOTAL COUNTED VALUE</div>
          <div className="text-xl font-semibold">{fmtUSD(totalCountedValue)}</div>
        </div>
        <div className="border rounded-lg p-3">
          <div className="text-xs opacity-75">TOTAL CHANGE (UNITS)</div>
          <div className="text-xl font-semibold tabular-nums">
            {fmtQty(totalDeltaUnits)}
          </div>
        </div>
        <div className="border rounded-lg p-3">
          <div className="text-xs opacity-75">TOTAL CHANGE ($)</div>
          <div className="text-xl font-semibold">{fmtUSD(totalDeltaValue)}</div>
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900/60">
            <tr>
              <th className="p-2 text-left">Item</th>
              <th className="p-2 text-right">Qty</th>
              <th className="p-2 text-left">Unit</th>
              <th className="p-2 text-right">$ / base</th>
              <th className="p-2 text-right">Line value</th>
              <th className="p-2 text-right">Change (units)</th>
              <th className="p-2 text-right">Change value ($)</th>
            </tr>
          </thead>
          <tbody>
            {viewRows.map((r, i) => (
              <tr key={`${r.name}-${i}`} className="border-t">
                <td className="p-2">{r.name}</td>
                <td className="p-2 text-right tabular-nums">{fmtQty(r.qty)}</td>
                <td className="p-2">{r.unit}</td>
                <td className="p-2 text-right tabular-nums">
                  {r.price ? fmtUSD(r.price) : "$0.00"}
                </td>
                <td className="p-2 text-right tabular-nums">{fmtUSD(r.lineValue)}</td>
                <td
                  className={`p-2 text-right tabular-nums ${
                    r.delta < 0 ? "text-red-500" : r.delta > 0 ? "text-emerald-500" : ""
                  }`}
                >
                  {fmtQty(r.delta)}
                </td>
                <td
                  className={`p-2 text-right tabular-nums ${
                    r.changeValue < 0
                      ? "text-red-500"
                      : r.changeValue > 0
                      ? "text-emerald-500"
                      : ""
                  }`}
                >
                  {fmtUSD(r.changeValue)}
                </td>
              </tr>
            ))}
            {viewRows.length === 0 && (
              <tr>
                <td className="p-3 text-neutral-400" colSpan={7}>
                  No lines found for this count.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot className="bg-neutral-900/40">
            <tr>
              <td className="p-2 font-medium">Totals</td>
              <td className="p-2"></td>
              <td className="p-2"></td>
              <td className="p-2"></td>
              <td className="p-2 text-right font-medium">{fmtUSD(totalCountedValue)}</td>
              <td className="p-2 text-right font-medium tabular-nums">
                {fmtQty(totalDeltaUnits)}
              </td>
              <td className="p-2 text-right font-medium">{fmtUSD(totalDeltaValue)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </main>
  );
}
