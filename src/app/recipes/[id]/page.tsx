import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { fmtUSD } from "@/lib/costing";
import { fmtQty } from "@/lib/format";

export const dynamic = "force-dynamic";

type Row = {
  item_id: string;
  name: string | null;
  base_unit: string | null;
  unit: string | null;
  counted_base: number | null;
  delta_base: number | null;
  // both exist in the view now, but we’ll treat them as optional
  unit_cost?: number | null;       // preferred alias
  unit_cost_base?: number | null;  // fallback alias
};

export default async function CountDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = params;
  const supabase = await createServerClient();

  // Pull only stable inputs; avoid computed-dollar columns to dodge PostgREST cache issues.
  const { data, error } = await supabase
    .from("v_count_lines_detailed")
    .select(
      [
        "item_id",
        "name",
        "base_unit",
        "unit",
        "counted_base",
        "delta_base",
        "unit_cost",
        "unit_cost_base",
      ].join(",")
    )
    .eq("count_id", id)
    .order("name", { ascending: true, nullsLast: true });

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
          Couldn’t load count lines (id {id}). {error.message}
        </p>
      </main>
    );
  }

  const rows: Row[] = (data ?? []).map((r: any) => ({
    item_id: r.item_id,
    name: r.name ?? "(item)",
    base_unit: r.base_unit ?? "",
    unit: r.unit ?? r.base_unit ?? "",
    counted_base: Number(r.counted_base ?? 0),
    delta_base: Number(r.delta_base ?? 0),
    unit_cost: r.unit_cost ?? null,
    unit_cost_base: r.unit_cost_base ?? null,
  }));

  // Compute $ values in app to keep schema-agnostic
  const display = rows.map((r) => {
    const cost =
      Number(
        r.unit_cost ?? r.unit_cost_base ?? 0 // prefer unit_cost, fallback to unit_cost_base
      ) || 0;

    const qty = r.counted_base || 0;
    const delta = r.delta_base || 0;

    const lineValue = qty * cost;     // counted_value_usd
    const changeValue = delta * cost; // change_value_usd

    return {
      name: r.name ?? "(item)",
      unit: r.base_unit ?? "",
      qty,
      delta,
      price: cost,
      lineValue,
      changeValue,
    };
  });

  const totals = display.reduce(
    (acc, r) => {
      acc.countedValue += r.lineValue;
      acc.deltaUnits += r.delta;
      acc.deltaValue += r.changeValue;
      return acc;
    },
    { countedValue: 0, deltaUnits: 0, deltaValue: 0 }
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

      <div className="grid md:grid-cols-3 gap-3">
        <div className="border rounded-lg p-3">
          <div className="text-xs opacity-75">TOTAL COUNTED VALUE</div>
          <div className="text-xl font-semibold">
            {fmtUSD(totals.countedValue)}
          </div>
        </div>
        <div className="border rounded-lg p-3">
          <div className="text-xs opacity-75">TOTAL CHANGE (UNITS)</div>
          <div className="text-xl font-semibold tabular-nums">
            {fmtQty(totals.deltaUnits)}
          </div>
        </div>
        <div className="border rounded-lg p-3">
          <div className="text-xs opacity-75">TOTAL CHANGE ($)</div>
          <div className="text-xl font-semibold">
            {fmtUSD(totals.deltaValue)}
          </div>
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
            {display.map((r, i) => (
              <tr key={`${r.name}-${i}`} className="border-t">
                <td className="p-2">{r.name}</td>
                <td className="p-2 text-right tabular-nums">{fmtQty(r.qty)}</td>
                <td className="p-2">{r.unit}</td>
                <td className="p-2 text-right tabular-nums">
                  {r.price ? fmtUSD(r.price) : "$0.00"}
                </td>
                <td className="p-2 text-right tabular-nums">
                  {fmtUSD(r.lineValue)}
                </td>
                <td
                  className={`p-2 text-right tabular-nums ${
                    r.delta < 0
                      ? "text-red-500"
                      : r.delta > 0
                      ? "text-emerald-500"
                      : ""
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
            {display.length === 0 && (
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
              <td className="p-2" />
              <td className="p-2" />
              <td className="p-2" />
              <td className="p-2 text-right font-medium">
                {fmtUSD(totals.countedValue)}
              </td>
              <td className="p-2 text-right font-medium tabular-nums">
                {fmtQty(totals.deltaUnits)}
              </td>
              <td className="p-2 text-right font-medium">
                {fmtUSD(totals.deltaValue)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </main>
  );
}
