import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { fmtUSD } from "@/lib/costing";
import { fmtQty } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Shape from v_count_lines_detailed_plus (all optional for resilience) */
type ViewRow = {
  count_id?: string;
  item_id?: string;
  name?: string | null;
  base_unit?: string | null;
  unit?: string | null;

  // base qtys
  expected_base?: number | null;
  counted_base?: number | null;
  delta_base?: number | null;

  // *_qty (compat)
  expected_qty?: number | null;
  counted_qty?: number | null;
  delta_qty?: number | null;

  // *_units (canonical for the page)
  counted_units?: number | null;
  change_units?: number | null;

  // cost + value fields
  unit_cost?: number | null;
  unit_cost_base?: number | null;
  line_value_usd?: number | null;
  counted_value_usd?: number | null;
  change_value_usd?: number | null;
  delta_value_usd?: number | null; // provided by the _plus view
};

function n(x: unknown): number {
  const v = Number(x);
  return Number.isFinite(v) ? v : 0;
}

export default async function CountDetailPage(props: any) {
  const id: string | undefined = props?.params?.id;
  if (!id || typeof id !== "string") notFound();

  const supabase = await createServerClient();

  // 1) Query the alias view that guarantees delta_value_usd exists
  const { data, error } = await supabase
    .from("v_count_lines_detailed_plus")
    .select(
      [
        "count_id",
        "item_id",
        "name",
        "base_unit",
        "unit",
        "expected_base",
        "counted_base",
        "delta_base",
        "expected_qty",
        "counted_qty",
        "delta_qty",
        "counted_units",
        "change_units",
        "unit_cost",
        "unit_cost_base",
        "line_value_usd",
        "counted_value_usd",
        "change_value_usd",
        "delta_value_usd",
      ].join(",")
    )
    .eq("count_id", id)
    .order("name", { ascending: true });

  if (error) {
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
          Couldn’t load count rows (id {id}). {error.message}
        </p>
      </main>
    );
  }

  // Ensure TS treats the payload as ViewRow[]
  const viewRows: ViewRow[] = Array.isArray(data) ? (data as unknown as ViewRow[]) : [];

  const rows = viewRows.map((r) => {
    // prefer canonical *_units, then *_qty, then *_base
    const qty =
      n(r.counted_units) ||
      n(r.counted_qty) ||
      n(r.counted_base);

    const deltaUnits =
      n(r.change_units) ||
      n(r.delta_qty) ||
      n(r.delta_base);

    // prefer explicit unit cost; tolerate legacy name
    const unitCost = n(r.unit_cost) || n(r.unit_cost_base);

    // prefer provided value fields; else derive from qty * unitCost
    const lineValue =
      n(r.counted_value_usd) ||
      n(r.line_value_usd) ||
      n(qty * unitCost);

    const changeValue =
      n(r.delta_value_usd) || // from alias view
      n(r.change_value_usd) ||
      n(deltaUnits * unitCost);

    return {
      itemName: r.name ?? "(item)",
      unit: (r.unit ?? r.base_unit ?? "") as string,
      qty,
      deltaUnits,
      unitCost,
      lineValue,
      changeValue,
    };
  });

  const totals = rows.reduce(
    (acc, r) => {
      acc.totalCountedValue += r.lineValue;
      acc.totalDeltaUnits += r.deltaUnits;
      acc.totalChangeValue += r.changeValue;
      return acc;
    },
    { totalCountedValue: 0, totalDeltaUnits: 0, totalChangeValue: 0 }
  );

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

      {/* Header totals */}
      <div className="grid md:grid-cols-3 gap-3">
        <div className="border rounded-lg p-3">
          <div className="text-xs opacity-75">TOTAL COUNTED VALUE</div>
          <div className="text-xl font-semibold">{fmtUSD(totals.totalCountedValue)}</div>
        </div>
        <div className="border rounded-lg p-3">
          <div className="text-xs opacity-75">TOTAL CHANGE (UNITS)</div>
          <div className="text-xl font-semibold tabular-nums">
            {fmtQty(totals.totalDeltaUnits)}
          </div>
        </div>
        <div className="border rounded-lg p-3">
          <div className="text-xs opacity-75">TOTAL CHANGE ($)</div>
          <div className="text-xl font-semibold">{fmtUSD(totals.totalChangeValue)}</div>
        </div>
      </div>

      {/* Lines table */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900/60">
            <tr>
              <th className="p-2 text-left">Item</th>
              <th className="p-2 text-right">Qty</th>
              <th className="p-2 text-left">Unit</th>
              <th className="p-2 text-right">$ / unit</th>
              <th className="p-2 text-right">Line value</th>
              <th className="p-2 text-right">Change (units)</th>
              <th className="p-2 text-right">Change value ($)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.itemName}-${i}`} className="border-t">
                <td className="p-2">{r.itemName}</td>
                <td className="p-2 text-right tabular-nums">{fmtQty(r.qty)}</td>
                <td className="p-2">{r.unit}</td>
                <td className="p-2 text-right tabular-nums">
                  {r.unitCost ? fmtUSD(r.unitCost) : "$0.00"}
                </td>
                <td className="p-2 text-right tabular-nums">{fmtUSD(r.lineValue)}</td>
                <td
                  className={`p-2 text-right tabular-nums ${
                    r.deltaUnits < 0 ? "text-red-500" : r.deltaUnits > 0 ? "text-emerald-500" : ""
                  }`}
                >
                  {fmtQty(r.deltaUnits)}
                </td>
                <td
                  className={`p-2 text-right tabular-nums ${
                    r.changeValue < 0 ? "text-red-500" : r.changeValue > 0 ? "text-emerald-500" : ""
                  }`}
                >
                  {fmtUSD(r.changeValue)}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
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
              <td className="p-2 text-right font-medium">{fmtUSD(totals.totalCountedValue)}</td>
              <td className="p-2 text-right font-medium tabular-nums">
                {fmtQty(totals.totalDeltaUnits)}
              </td>
              <td className="p-2 text-right font-medium">{fmtUSD(totals.totalChangeValue)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </main>
  );
}
