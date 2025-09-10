// src/app/inventory/counts/[id]/page.tsx
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { fmtUSD } from "@/lib/costing";
import { fmtQty } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Row shape coming from public.v_count_lines_detailed (as verified in SQL) */
type ViewRow = {
  count_id: string;
  item_id: string;
  name: string | null;
  base_unit: string | null;
  unit: string | null;

  expected_base: number | null;
  counted_base: number | null;
  delta_base: number | null;

  expected_qty: number | null;
  counted_qty: number | null;
  delta_qty: number | null;

  counted_units: number | null;
  change_units: number | null;

  unit_cost: number | null;
  unit_cost_base: number | null;

  line_value_usd: number | null;     // explicit line value if present
  counted_value_usd: number | null;  // explicit line value (legacy/alt)
  change_value_usd: number | null;   // explicit delta value (alt)
  delta_value_usd: number | null;    // explicit delta value (legacy/alt)

  tenant_id: string | null;
};

/** Small helper: coerce DB numerics/nulls/strings to a number (or 0) */
function n(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const num = typeof v === "number" ? v : Number(v);
  return Number.isFinite(num) ? num : 0;
}

export default async function CountDetailPage({
  params: { id },
}: {
  params: { id: string };
}) {
  const supabase = await createServerClient();

  // Fetch exactly the columns we render and type the response.
  const { data, error } = await supabase
    .from("v_count_lines_detailed")
    .select(
      `
      count_id,
      item_id,
      name,
      base_unit, unit,
      expected_base, counted_base, delta_base,
      expected_qty, counted_qty, delta_qty,
      counted_units, change_units,
      unit_cost, unit_cost_base,
      line_value_usd, counted_value_usd,
      change_value_usd, delta_value_usd,
      tenant_id
    `
    )
    .eq("count_id", id)
    .order("name", { ascending: true })
    .returns<ViewRow[]>();

  if (error) {
    // Soft-error UI so user can navigate back without crashing the page
    return (
      <main className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Inventory Count</h1>
          <Link
            href="/inventory/counts"
            className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
          >
            Back to counts
          </Link>
        </div>
        <p className="text-red-400 text-sm">
          Couldn&apos;t load count rows (id {id}). {error.message}
        </p>
      </main>
    );
  }

  const rows = (data ?? []).map((r) => {
    // Prefer canonical *_units, then *_qty, then *_base
    const qty =
      n(r.counted_units) || n(r.counted_qty) || n(r.counted_base);

    const deltaUnits =
      n(r.change_units) || n(r.delta_qty) || n(r.delta_base);

    // Prefer explicit unit cost; tolerate alternate column
    const unitCost = n(r.unit_cost) || n(r.unit_cost_base);

    // Prefer explicit value fields; otherwise compute
    const lineValue =
      n(r.line_value_usd) || n(r.counted_value_usd) || qty * unitCost;

    const changeValue =
      n(r.delta_value_usd) || n(r.change_value_usd) || deltaUnits * unitCost;

    return {
      itemId: r.item_id,
      itemName: r.name ?? "(item)",
      unit: (r.unit ?? r.base_unit ?? "") as string,
      qty,
      unitCost,
      lineValue,
      deltaUnits,
      changeValue,
    };
  });

  // Totals for footer cards
  const totals = rows.reduce(
    (acc, r) => {
      acc.totalQty += r.qty;
      acc.totalLine += r.lineValue;
      acc.totalDeltaUnits += r.deltaUnits;
      acc.totalDeltaValue += r.changeValue;
      return acc;
    },
    { totalQty: 0, totalLine: 0, totalDeltaUnits: 0, totalDeltaValue: 0 }
  );

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Inventory Count</h1>
          <p className="text-xs text-neutral-500">
            Count ID: <code className="select-all">{id}</code>
          </p>
        </div>

        <Link
          href="/inventory/counts"
          className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
        >
          Back to counts
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid md:grid-cols-4 gap-3">
        <div className="border rounded-lg p-3">
          <div className="text-xs opacity-75">LINES</div>
          <div className="text-xl font-semibold tabular-nums">{rows.length}</div>
        </div>
        <div className="border rounded-lg p-3">
          <div className="text-xs opacity-75">TOTAL QTY</div>
          <div className="text-xl font-semibold tabular-nums">
            {fmtQty(totals.totalQty)}
          </div>
        </div>
        <div className="border rounded-lg p-3">
          <div className="text-xs opacity-75">TOTAL LINE VALUE</div>
          <div className="text-xl font-semibold tabular-nums">
            {fmtUSD(totals.totalLine)}
          </div>
        </div>
        <div className="border rounded-lg p-3">
          <div className="text-xs opacity-75">TOTAL Δ VALUE</div>
          <div className="text-xl font-semibold tabular-nums">
            {fmtUSD(totals.totalDeltaValue)}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900/60">
            <tr>
              <th className="p-2 text-left">Item</th>
              <th className="p-2 text-left">Unit</th>
              <th className="p-2 text-right">Qty</th>
              <th className="p-2 text-right">$ / unit</th>
              <th className="p-2 text-right">Line value</th>
              <th className="p-2 text-right">Δ units</th>
              <th className="p-2 text-right">Δ value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.itemId} className="border-t">
                <td className="p-2">{r.itemName}</td>
                <td className="p-2">{r.unit}</td>
                <td className="p-2 text-right tabular-nums">
                  {fmtQty(r.qty)}
                </td>
                <td className="p-2 text-right tabular-nums">
                  {r.unitCost ? fmtUSD(r.unitCost) : "$0.00"}
                </td>
                <td className="p-2 text-right tabular-nums">
                  {fmtUSD(r.lineValue)}
                </td>
                <td className="p-2 text-right tabular-nums">
                  {fmtQty(r.deltaUnits)}
                </td>
                <td className="p-2 text-right tabular-nums">
                  {fmtUSD(r.changeValue)}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="p-3 text-neutral-400" colSpan={7}>
                  No rows for this count.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot className="bg-neutral-900/40">
            <tr>
              <td className="p-2 font-medium">Totals</td>
              <td />
              <td className="p-2 text-right font-medium tabular-nums">
                {fmtQty(totals.totalQty)}
              </td>
              <td />
              <td className="p-2 text-right font-medium tabular-nums">
                {fmtUSD(totals.totalLine)}
              </td>
              <td className="p-2 text-right font-medium tabular-nums">
                {fmtQty(totals.totalDeltaUnits)}
              </td>
              <td className="p-2 text-right font-medium tabular-nums">
                {fmtUSD(totals.totalDeltaValue)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </main>
  );
}
