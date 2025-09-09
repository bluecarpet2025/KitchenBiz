// src/app/inventory/counts/[id]/page.tsx
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { fmtUSD } from "@/lib/costing";
import { fmtQty } from "@/lib/format";

export const dynamic = "force-dynamic";

type RawLine = {
  count_id: string;
  item_id: string;
  expected_base: number | null;
  counted_base: number | null;
  delta_base: number | null;
};

type ItemInfo = { id: string; name: string | null; base_unit: string | null };

type CostRow = { item_id: string; [k: string]: number | string | null };

function pickCostPerBase(row?: CostRow | null): number {
  if (!row) return 0;
  // Be tolerant to different column names in v_item_avg_costs
  const candidates = [
    "avg_unit_cost",
    "avg_cost_per_base",
    "avg_per_base",
    "unit_cost_base",
  ];
  for (const key of candidates) {
    const v = row[key];
    const n = Number(v);
    if (!Number.isNaN(n) && Number.isFinite(n) && n >= 0) return n;
  }
  return 0;
}

export default async function CountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerClient();

  // 1) Load raw count lines (truth source)
  const { data: rawLines, error: rawErr } = await supabase
    .from("inventory_count_lines")
    .select("count_id,item_id,expected_base,counted_base,delta_base")
    .eq("count_id", id);

  if (rawErr) {
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
          Couldn’t load count lines (id {id}). {rawErr.message}
        </p>
      </main>
    );
  }

  const lines: RawLine[] = (rawLines ?? []).map((r: any) => ({
    count_id: r.count_id,
    item_id: r.item_id,
    expected_base: Number(r.expected_base ?? 0),
    counted_base: Number(r.counted_base ?? 0),
    delta_base: Number(r.delta_base ?? 0),
  }));

  // 2) Item names/units lookup
  const itemIds = Array.from(new Set(lines.map((l) => l.item_id)));
  const itemsById = new Map<string, ItemInfo>();
  if (itemIds.length) {
    const { data: items } = await supabase
      .from("inventory_items")
      .select("id,name,base_unit")
      .in("id", itemIds);
    (items ?? []).forEach((it: any) =>
      itemsById.set(it.id, {
        id: it.id,
        name: it.name,
        base_unit: it.base_unit,
      })
    );
  }

  // 3) Try to get average cost per base (tolerant to column names)
  const costsById = new Map<string, CostRow>();
  if (itemIds.length) {
    // We’ll try a few selections until one succeeds.
    const selects = [
      "item_id,avg_unit_cost",
      "item_id,avg_cost_per_base",
      "item_id,avg_per_base",
      "item_id,unit_cost_base",
    ];
    let costData: any[] | null = null;

    for (const sel of selects) {
      const { data, error } = await supabase
        .from("v_item_avg_costs")
        .select(sel)
        .in("item_id", itemIds);
      if (!error && data) {
        costData = data as any[];
        break;
      }
    }
    (costData ?? []).forEach((r: any) => {
      costsById.set(r.item_id as string, r);
    });
  }

  // 4) Compose display rows + totals (never zero-out real data)
  const rows = lines.map((l) => {
    const info =
      itemsById.get(l.item_id) ?? ({ id: l.item_id, name: "(item)", base_unit: "" } as ItemInfo);
    const cost = pickCostPerBase(costsById.get(l.item_id) ?? null);

    const qty = Number(l.counted_base ?? 0);
    const delta = Number(l.delta_base ?? 0);
    const lineValue = qty * cost;
    const changeValue = delta * cost;

    return {
      name: info.name ?? "(item)",
      unit: info.base_unit ?? "",
      qty,
      delta,
      price: cost,
      lineValue,
      changeValue,
    };
  });

  // Totals
  const totals = rows.reduce(
    (acc, r) => {
      acc.countedValue += r.lineValue;
      acc.deltaUnits += r.delta;
      acc.deltaValue += r.changeValue;
      return acc;
    },
    { countedValue: 0, deltaUnits: 0, deltaValue: 0 }
  );

  // Stable sort by item name
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
            {rows.map((r, i) => (
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
