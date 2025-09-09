// src/app/inventory/counts/[id]/page.tsx
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { fmtUSD } from "@/lib/costing";
import { fmtQty } from "@/lib/format";

export const dynamic = "force-dynamic";

// Raw count line straight from inventory_count_lines
type RawLine = {
  count_id: string;
  item_id: string;
  expected_base: number | null;
  counted_base: number | null;
  delta_base: number | null;
  tenant_id: string;
};

type ItemRow = { id: string; name: string | null; base_unit: string | null };

// v_item_avg_costs columns (per your dump: tenant_id, item_id, avg_unit_cost)
type CostRow = { item_id: string; avg_unit_cost: number | null };

// Pick a usable cost per base unit
function pickCostPerBase(c?: CostRow | null): number {
  const v = c?.avg_unit_cost;
  return typeof v === "number" && isFinite(v) ? v : 0;
}

export default async function CountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createServerClient();

  // 1) Pull raw lines — truth source
  const { data: rawLines, error: rawErr } = await supabase
    .from("inventory_count_lines")
    .select("count_id,item_id,expected_base,counted_base,delta_base,tenant_id")
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
    count_id: String(r.count_id),
    item_id: String(r.item_id),
    expected_base: Number(r.expected_base ?? 0),
    counted_base: Number(r.counted_base ?? 0),
    delta_base: Number(r.delta_base ?? 0),
    tenant_id: String(r.tenant_id),
  }));

  // Empty count (or not found)
  if (lines.length === 0) {
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
        <div className="border rounded-lg p-3">
          <p className="text-neutral-300">No lines found for this count.</p>
        </div>
      </main>
    );
  }

  // 2) Item names/units
  const itemIds = Array.from(new Set(lines.map((l) => l.item_id)));
  const { data: itemsRaw } = await supabase
    .from("inventory_items")
    .select("id,name,base_unit")
    .in("id", itemIds);

  const itemsById = new Map<string, ItemRow>();
  (itemsRaw ?? []).forEach((it: any) => {
    itemsById.set(String(it.id), {
      id: String(it.id),
      name: it.name ?? null,
      base_unit: it.base_unit ?? null,
    });
  });

  // 3) Costs (from v_item_avg_costs: tenant_id,item_id,avg_unit_cost)
  //    Use tenant_id from the first line (all lines share the same tenant).
  const tenantId = lines[0].tenant_id;
  let costsById = new Map<string, CostRow>();
  if (tenantId && itemIds.length) {
    const { data: costsRaw } = await supabase
      .from("v_item_avg_costs")
      .select("item_id,avg_unit_cost")
      .eq("tenant_id", tenantId)
      .in("item_id", itemIds);

    (costsRaw ?? []).forEach((c: any) => {
      costsById.set(String(c.item_id), {
        item_id: String(c.item_id),
        avg_unit_cost: c.avg_unit_cost == null ? null : Number(c.avg_unit_cost),
      });
    });
  }

  // 4) Build display rows and totals
  const rows = lines.map((l) => {
    const info = itemsById.get(l.item_id);
    const name = info?.name ?? "(item)";
    const unit = info?.base_unit ?? "";

    const cost = pickCostPerBase(costsById.get(l.item_id));

    const qty = Number(l.counted_base ?? 0);
    const delta = Number(l.delta_base ?? 0);
    const lineValue = qty * cost;
    const changeValue = delta * cost;

    return { name, unit, qty, delta, price: cost, lineValue, changeValue };
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

  // Sort by item name for stable order
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
          <div className="text-xl font-semibold tabular-nums">{fmtQty(totals.deltaUnits)}</div>
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
