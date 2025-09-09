// src/app/inventory/counts/[id]/page.tsx
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { getEffectiveTenant } from "@/lib/effective-tenant";
import { fmtQty } from "@/lib/format";

export const dynamic = "force-dynamic";

type CountRow = {
  id: string;
  tenant_id: string;
  status: string;
  created_at: string | null;
  counted_at: string | null;
};

type HeaderTotals = {
  count_id: string;
  total_counted_value_usd: number | null;
  total_change_units: number | null;
  total_change_value_usd: number | null;
};

type LineRow = {
  count_id: string;
  item_id: string;
  name: string | null;
  base_unit: string | null;
  expected_base: number | null;
  counted_base: number | null;
  delta_base: number | null;
  unit_cost_base: number | null;       // $ per base unit
  line_value_usd: number | null;       // counted_base * cost
  change_value_usd: number | null;     // |delta_base| * cost
};

export default async function CountDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return (
      <main className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Inventory Count</h1>
        <p className="mt-4">Sign in required.</p>
        <Link href="/login?redirect=/inventory/counts" className="underline">Go to login</Link>
      </main>
    );
  }

  const tenantId = await getEffectiveTenant(supabase);
  if (!tenantId) {
    return (
      <main className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Inventory Count</h1>
        <p className="mt-4">Profile missing tenant.</p>
      </main>
    );
  }

  // Load the count shell (for status / timestamp)
  const { data: count, error: cErr } = await supabase
    .from("inventory_counts")
    .select("id,tenant_id,status,created_at,counted_at")
    .eq("id", params.id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (cErr) throw cErr;
  if (!count) {
    return (
      <main className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Inventory Count</h1>
        <p className="mt-4">Count not found.</p>
        <Link href="/inventory/counts" className="underline">Back to counts</Link>
      </main>
    );
  }

  // Header totals from the view (now backed by avg item cost)
  const { data: header, error: hErr } = await supabase
    .from("v_count_header_totals")
    .select("count_id,total_counted_value_usd,total_change_units,total_change_value_usd")
    .eq("count_id", params.id)
    .maybeSingle<HeaderTotals>();
  if (hErr) throw hErr;

  // Detailed lines (per-item)
  const { data: linesData, error: lErr } = await supabase
    .from("v_count_lines_detailed")
    .select(
      "count_id,item_id,name,base_unit,expected_base,counted_base,delta_base,unit_cost_base,line_value_usd,change_value_usd"
    )
    .eq("count_id", params.id)
    .order("name", { ascending: true });
  if (lErr) throw lErr;
  const lines = (linesData ?? []) as LineRow[];

  // Safe header fallbacks
  const totalCountedValue = Number(header?.total_counted_value_usd ?? 0);
  const totalChangeUnits  = Number(header?.total_change_units ?? 0);
  const totalChangeValue  = Number(header?.total_change_value_usd ?? 0);

  function fmtUsd(n: number | null | undefined) {
    const v = Number(n ?? 0);
    return v.toLocaleString(undefined, { style: "currency", currency: "USD" });
  }

  return (
    <main className="max-w-6xl mx-auto p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Inventory Count</h1>
        <div className="space-x-2">
          <Link href="/inventory/counts" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
            Back to counts
          </Link>
          <Link href={`/inventory/counts/${params.id}/edit`} className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
            Edit
          </Link>
        </div>
      </div>

      <p className="text-xs mt-1 opacity-70">
        {new Date(count.created_at ?? Date.now()).toLocaleString()} — {count.status ?? "draft"}
      </p>

      {/* Header cards */}
      <div className="grid md:grid-cols-3 gap-4 mt-4">
        <div className="border rounded p-3">
          <div className="text-xs opacity-70">TOTAL COUNTED VALUE</div>
          <div className="text-xl font-semibold">{fmtUsd(totalCountedValue)}</div>
        </div>
        <div className="border rounded p-3">
          <div className="text-xs opacity-70">TOTAL CHANGE (UNITS)</div>
          <div className="text-xl font-semibold">{fmtQty(totalChangeUnits)}</div>
        </div>
        <div className="border rounded p-3">
          <div className="text-xs opacity-70">TOTAL CHANGE ($)</div>
          <div className="text-xl font-semibold">{fmtUsd(totalChangeValue)}</div>
        </div>
      </div>

      {/* Lines table */}
      <div className="mt-5 border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900/60">
            <tr>
              <th className="text-left p-2">Item</th>
              <th className="text-right p-2">Qty</th>
              <th className="text-left p-2">Unit</th>
              <th className="text-right p-2">$ / base</th>
              <th className="text-right p-2">Line value</th>
              <th className="text-right p-2">Change (units)</th>
              <th className="text-right p-2">Change value ($)</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((r) => (
              <tr key={r.item_id} className="border-t">
                <td className="p-2">{r.name ?? "-"}</td>
                <td className="p-2 text-right tabular-nums">{fmtQty(r.counted_base)}</td>
                <td className="p-2">{r.base_unit ?? "-"}</td>
                <td className="p-2 text-right tabular-nums">{fmtUsd(r.unit_cost_base)}</td>
                <td className="p-2 text-right tabular-nums">{fmtUsd(r.line_value_usd)}</td>
                <td className="p-2 text-right tabular-nums">{fmtQty(r.delta_base)}</td>
                <td className="p-2 text-right tabular-nums">{fmtUsd(r.change_value_usd)}</td>
              </tr>
            ))}
            {lines.length === 0 && (
              <tr>
                <td colSpan={7} className="p-3 text-neutral-400">
                  No lines yet.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot className="border-t bg-neutral-900/30">
            <tr>
              <td className="p-2 font-medium">Totals</td>
              <td />
              <td />
              <td />
              <td className="p-2 text-right tabular-nums">{fmtUsd(totalCountedValue)}</td>
              <td className="p-2 text-right tabular-nums">{fmtQty(totalChangeUnits)}</td>
              <td className="p-2 text-right tabular-nums">{fmtUsd(totalChangeValue)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </main>
  );
}
