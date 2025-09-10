import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { fmtUSD } from "@/lib/costing";
import { fmtQty } from "@/lib/format";

export const dynamic = "force-dynamic";

type ViewRow = {
  // identifiers / display
  count_id: string;
  item_id: string;
  name: string | null;
  base_unit: string | null;
  unit?: string | null;

  // canonical base-qty fields
  expected_base: number | null;
  counted_base: number | null;
  delta_base: number | null;

  // legacy/alias qty fields
  expected_qty?: number | null;
  counted_qty?: number | null;
  delta_qty?: number | null;

  // cost per base (either name may exist)
  unit_cost?: number | null;
  unit_cost_base?: number | null;

  // value fields (wrapper exposes these)
  line_value_usd?: number | null;
  counted_value_usd?: number | null;
  change_value_usd?: number | null;
  delta_value_usd?: number | null;
};

function num(x: unknown): number {
  const v = Number(x);
  return Number.isFinite(v) ? v : 0;
}

function pick<T extends object>(
  obj: T | null | undefined,
  ...keys: (keyof T)[]
): any {
  if (!obj) return undefined;
  for (const k of keys) {
    const v = (obj as any)[k];
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
}

export default async function CountDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = params;
  const supabase = await createServerClient();

  // Query the alias view that guarantees delta_value_usd exists.
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

  // Coerce to our row type to avoid TS generic mismatches across client versions.
  const raw: ViewRow[] = ((data ?? []) as any) as ViewRow[];

  const rows = raw.map((r) => {
    const unitCost = num(pick(r, "unit_cost", "unit_cost_base"));

    // Prefer canonical *_base, fall back to *_qty if present
    const qty = num(r.counted_base ?? r.counted_qty);
    const deltaUnits = num(r.delta_base ?? r.delta_qty);

    // Prefer explicit values from the view; else derive from unit cost
    const countedValue =
      num(pick(r, "counted_value_usd", "line_value_usd")) || num(qty * unitCost);
    const changeValue =
      num(pick(r, "change_value_usd", "delta_value_usd")) ||
      num(deltaUnits * unitCost);

    return {
      item: r.name ?? "(item)",
      unit: r.base_unit ?? r.unit ?? "",
      qty,
      price: unitCost,
      lineValue: countedValue,
      deltaUnits,
      changeValue,
    };
  });

  const totals = rows.reduce(
    (acc, r) => {
      acc.countedValue += r.lineValue;
      acc.deltaUnits += r.deltaUnits;
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
          <div className="text-xl font-semibold">{fmtUSD(totals.countedValue)}</div>
        </div>
        <div className="border rounded-lg p-3">
          <div className="text-xs opacity-75">TOTAL CHANGE (UNITS)</div>
          <div className="text-xl font-semibold tabular-nums">
            {fmtQty(totals.deltaUnits)}
          </div>
        </div>
        <div className="border rounded-lg p-3">
          <div className="text-xs opacity-75">TOTAL CHANGE ($)</div>
          <div className="text-xl font-semibold">{fmtUSD(totals.deltaValue)}</div>
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
            {rows.map((r, i) => (
              <tr key={`${r.item}-${i}`} className="border-t">
                <td className="p-2">{r.item}</td>
                <td className="p-2 text-right tabular-nums">{fmtQty(r.qty)}</td>
                <td className="p-2">{r.unit}</td>
                <td className="p-2 text-right tabular-nums">
                  {r.price ? fmtUSD(r.price) : "$0.00"}
                </td>
                <td className="p-2 text-right tabular-nums">{fmtUSD(r.lineValue)}</td>
                <td
                  className={`p-2 text-right tabular-nums ${
                    r.deltaUnits < 0
                      ? "text-red-500"
                      : r.deltaUnits > 0
                      ? "text-emerald-500"
                      : ""
                  }`}
                >
                  {fmtQty(r.deltaUnits)}
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
              <td className="p-2 text-right font-medium">{fmtUSD(totals.countedValue)}</td>
              <td className="p-2 text-right font-medium tabular-nums">
                {fmtQty(totals.deltaUnits)}
              </td>
              <td className="p-2 text-right font-medium">{fmtUSD(totals.deltaValue)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </main>
  );
}
