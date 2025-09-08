import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { fmtUSD } from "@/lib/costing";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

type CountRow = {
  id: string;
  note: string | null;
  created_at: string;
  status: string | null;
};

type LineBasic = {
  item_id: string;
  expected_base: number | null;
  counted_base: number | null;
  delta_base: number | null; // present but not always reliable on legacy rows
};

type AdjRow = {
  item_id: string;
  delta_base: number;
};

type Item = {
  id: string;
  name: string | null;
  base_unit: string | null;
  pack_to_base_factor: number | null;
  last_price: number | null;
};

async function getTenant() {
  const supabase = await createServerClient();
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id ?? null;
  if (!uid) return { supabase, tenantId: null };

  const { data: prof } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", uid)
    .maybeSingle();

  return { supabase, tenantId: prof?.tenant_id ?? null };
}

function perBaseUSD(item: Item | undefined): number {
  if (!item) return 0;
  const price = Number(item.last_price ?? 0);
  const factor = Number(item.pack_to_base_factor ?? 0);
  return factor > 0 ? price / factor : 0;
}

function safeNum(n: number | null | undefined) {
  return Number.isFinite(Number(n)) ? Number(n) : 0;
}

export default async function CountDetailPage({ params }: Ctx) {
  const { id } = await params;
  const { supabase, tenantId } = await getTenant();

  if (!tenantId) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Inventory Count</h1>
        <p className="mt-4">Sign in required or profile missing tenant.</p>
        <Link className="underline" href="/login?redirect=/inventory/counts">
          Go to login
        </Link>
      </main>
    );
  }

  const { data: count } = await supabase
    .from("inventory_counts")
    .select("id,note,created_at,status")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();

  if (!count) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Inventory Count</h1>
        <p className="mt-4">Count not found.</p>
        <Link href="/inventory/counts" className="underline">
          Back to counts
        </Link>
      </main>
    );
  }

  // Base lines (may be partially empty for older rows)
  const { data: linesBasic } = await supabase
    .from("inventory_count_lines")
    .select("item_id,expected_base,counted_base,delta_base")
    .eq("tenant_id", tenantId)
    .eq("count_id", id);

  const basics: LineBasic[] = (linesBasic ?? []) as LineBasic[];

  // Adjustments fallback – the source of truth for totals on the list
  const { data: adjsRaw } = await supabase
    .from("inventory_adjustments")
    .select("item_id,delta_base")
    .eq("tenant_id", tenantId)
    .eq("ref_count_id", id);

  const adjByItem = new Map<string, number>();
  (adjsRaw ?? []).forEach((a) => {
    const k = (a as AdjRow).item_id;
    const v = safeNum((a as AdjRow).delta_base);
    adjByItem.set(k, (adjByItem.get(k) ?? 0) + v);
  });

  const itemIds = Array.from(new Set(basics.map((b) => b.item_id))).filter(Boolean);
  let items: Item[] = [];
  if (itemIds.length) {
    const { data: itemsRaw } = await supabase
      .from("inventory_items")
      .select("id,name,base_unit,pack_to_base_factor,last_price")
      .in("id", itemIds);
    items = (itemsRaw ?? []) as Item[];
  }
  const itemMap = new Map(items.map((it) => [it.id, it]));

  // Build rows; choose the best available delta per item
  const rows = basics.map((b) => {
    const it = itemMap.get(b.item_id);
    const unit = it?.base_unit ?? "";
    const name = it?.name ?? "(deleted item)";
    const usdPerBase = perBaseUSD(it);

    const counted = safeNum(b.counted_base);
    const expected = safeNum(b.expected_base);
    const storedDelta = safeNum(b.delta_base);
    const adjDelta = adjByItem.get(b.item_id) ?? 0;

    // 1) if we have meaningful counted/expected, use that
    const hasMeaningfulCounts = counted !== 0 || expected !== 0;
    const computedDelta = counted - expected;

    const delta = hasMeaningfulCounts
      ? computedDelta
      : (storedDelta !== 0 ? storedDelta : adjDelta);

    const lineValue = counted * usdPerBase;
    const changeValue = delta * usdPerBase;

    return {
      item_id: b.item_id,
      name,
      unit,
      usdPerBase,
      counted,
      expected,
      delta,
      lineValue,
      changeValue,
    };
  });

  const totalCountedUsd = rows.reduce((s, r) => s + r.lineValue, 0);
  const totalChangeUnits = rows.reduce((s, r) => s + Math.abs(r.delta), 0);
  const totalChangeUsd = rows.reduce((s, r) => s + Math.abs(r.changeValue), 0);

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Inventory Count</h1>
        <div className="flex gap-2">
          <Link href="/inventory/counts" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
            Back to counts
          </Link>
          <Link href={`/inventory/counts/${count.id}/edit`} className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
            Edit
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="border rounded-lg p-4">
          <div className="text-xs opacity-70">TOTAL COUNTED VALUE</div>
          <div className="text-xl font-semibold">{fmtUSD(totalCountedUsd)}</div>
        </div>
        <div className="border rounded-lg p-4">
          <div className="text-xs opacity-70">TOTAL CHANGE (UNITS)</div>
          <div className="text-xl font-semibold tabular-nums">{totalChangeUnits.toFixed(3)}</div>
        </div>
        <div className="border rounded-lg p-4">
          <div className="text-xs opacity-70">TOTAL CHANGE ($)</div>
          <div className="text-xl font-semibold">{fmtUSD(totalChangeUsd)}</div>
        </div>
      </div>

      <table className="w-full text-sm table-auto">
        <thead>
          <tr className="text-left text-neutral-300">
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
            <tr key={r.item_id} className="border-t">
              <td className="p-2">{r.name}</td>
              <td className="p-2 text-right tabular-nums">{(r.counted ?? 0).toFixed(3)}</td>
              <td className="p-2">{r.unit}</td>
              <td className="p-2 text-right tabular-nums">{fmtUSD(r.usdPerBase)}</td>
              <td className="p-2 text-right tabular-nums">{fmtUSD(r.lineValue)}</td>
              <td
                className={`p-2 text-right tabular-nums ${
                  r.delta < 0 ? "text-red-500" : r.delta > 0 ? "text-emerald-500" : ""
                }`}
              >
                {Number(r.delta ?? 0).toFixed(3)}
              </td>
              <td className="p-2 text-right tabular-nums">{fmtUSD(r.changeValue)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td className="p-3 text-neutral-400" colSpan={7}>
                No lines.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
