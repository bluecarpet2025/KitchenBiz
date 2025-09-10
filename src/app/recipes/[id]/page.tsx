// src/app/inventory/counts/[id]/page.tsx
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { fmtUSD } from "@/lib/costing";
import { fmtQty } from "@/lib/format";

export const dynamic = "force-dynamic";

// Keep props loose to withstand Next type drift
export default async function CountDetailPage(props: any) {
  const id: string =
    (await props?.params?.id) ?? props?.params?.id ?? props?.params?.["id"];

  const supabase = await createServerClient();

  // Query the wrapper view that includes a legacy alias: delta_value_usd
  const { data, error } = await supabase
    .from("v_count_lines_detailed_plus")
    .select(
      [
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
        "delta_value_usd", // present on the wrapper for compatibility
      ].join(",")
    )
    .eq("count_id", id)
    // Supabase JS: supports nullsFirst (not nullsLast)
    .order("name", { ascending: true, nullsFirst: false });

  if (error) {
    return (
      <main className="max-w-6xl mx-auto p-6 space-y-4">
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

  const rows = (data ?? []).map((r: any) => {
    const qty = Number(r.counted_units ?? r.counted_base ?? 0);
    const deltaUnits = Number(r.change_units ?? r.delta_base ?? 0);

    const unitCost = Number(
      r.unit_cost ?? (typeof r.unit_cost_base === "number" ? r.unit_cost_base : 0)
    );

    // Use values provided by the view when present; compute as fallback
    const lineValue =
      typeof r.line_value_usd === "number" ? Number(r.line_value_usd) : qty * unitCost;

    const changeValue =
      typeof r.delta_value_usd === "number"
        ? Number(r.delta_value_usd) // legacy alias, guaranteed by wrapper
        : typeof r.change_value_usd === "number"
        ? Number(r.change_value_usd)
        : deltaUnits * unitCost;

    const unit = (r.unit ?? r.base_unit ?? "") as string;

    return {
      itemId: String(r.item_id ?? ""),
      name: r.name ?? "(item)",
      unit,
      qty,
      price: unitCost,
      lineValue,
      delta: deltaUnits,
      changeValue,
    };
  });

  const totals = rows.reduce(
    (acc, r) => {
      acc.countedValue += r.lineValue;
      acc.deltaUnits += r.delta;
      acc.deltaValue += r.changeValue;
      return acc;
    },
    { countedValue: 0, deltaUnits: 0, deltaValue: 0 }
  );

  rows.sort((a, b) => a.name.localeCompare(b.name));

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
            {rows.map((r) => (
              <tr key={r.itemId} className="border-t">
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

      <div className="text-xs text-neutral-500 mt-2">
        Count ID: <code className="select-all">{id}</code>
      </div>
    </main>
  );
}
