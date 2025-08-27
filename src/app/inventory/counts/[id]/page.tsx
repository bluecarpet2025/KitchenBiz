// src/app/inventory/counts/[id]/page.tsx
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { fmtUSD } from "@/lib/costing";

export const dynamic = "force-dynamic";

type Count = {
  id: string;
  tenant_id: string;
  note: string | null;
  status: string | null;
  counted_at: string | null;
  created_at: string | null;
};

type Line = {
  item_id: string;
  name: string;
  base_unit: string;
  counted_qty: number;
  delta_base: number | null;
  unit_cost: number;
  counted_value_usd: number;
  delta_value_usd: number;
};

export default async function CountDetailPage({
  params,
}: {
  // Next 15 page props are Promises for server components
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createServerClient();
  const { data: u } = await supabase.auth.getUser();
  const user = u.user ?? null;

  if (!user) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Inventory Count</h1>
        <p className="mt-4">Sign in required.</p>
        <Link className="underline" href="/login?redirect=/inventory/counts">
          Go to login
        </Link>
      </main>
    );
  }

  const { data: prof } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  const tenantId = prof?.tenant_id ?? null;
  if (!tenantId) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Inventory Count</h1>
        <p className="mt-4">Profile missing tenant.</p>
      </main>
    );
  }

  // Ensure the count belongs to this tenant
  const { data: countRaw, error: cErr } = await supabase
    .from("inventory_counts")
    .select("id,tenant_id,note,status,counted_at,created_at")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();

  if (cErr) throw cErr;
  if (!countRaw) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Inventory Count</h1>
        <p className="mt-4">Count not found.</p>
        <Link className="underline" href="/inventory/counts">
          Back to counts
        </Link>
      </main>
    );
  }

  // ✅ Safe alias after the guard so TS knows it's not undefined
  const c = countRaw as Count;

  // Load detailed lines from the helper view
  const { data: linesRaw, error: lErr } = await supabase
    .from("v_count_lines_detailed")
    .select(
      "item_id,name,base_unit,counted_qty,delta_base,unit_cost,counted_value_usd,delta_value_usd"
    )
    .eq("tenant_id", tenantId)
    .eq("count_id", c.id);

  if (lErr) throw lErr;
  const lines = (linesRaw ?? []) as Line[];

  const totals = lines.reduce(
    (acc, r) => {
      acc.countedValue += Number(r.counted_value_usd || 0);
      acc.deltaAbs += Math.abs(Number(r.delta_base || 0));
      acc.deltaValue += Number(r.delta_value_usd || 0);
      return acc;
    },
    { countedValue: 0, deltaAbs: 0, deltaValue: 0 }
  );

  const when = (c.counted_at ?? c.created_at) ?? "";

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-2xl font-semibold">Inventory Count</div>
          <div className="text-sm opacity-70">
            {when ? new Date(when).toLocaleString() : "—"} • {c.status ?? "draft"}
          </div>
          {c.note && <div className="text-sm mt-1">{c.note}</div>}
        </div>
        <div className="flex gap-2">
          <Link
            href="/inventory/counts"
            className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
          >
            Back to counts
          </Link>
          <Link
            href={`/inventory/counts/${c.id}/edit`}
            className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
          >
            Edit
          </Link>
        </div>
      </div>

      {/* Plain-language KPI tiles */}
      <div className="grid md:grid-cols-3 gap-4">
        <div className="border rounded p-3">
          <div className="text-xs uppercase opacity-70">Total counted value</div>
          <div className="text-xl tabular-nums font-semibold">
            {fmtUSD(totals.countedValue)}
          </div>
        </div>
        <div className="border rounded p-3">
          <div className="text-xs uppercase opacity-70">Total change (units)</div>
          <div className="text-xl tabular-nums font-semibold">
            {totals.deltaAbs.toFixed(3)}
          </div>
        </div>
        <div className="border rounded p-3">
          <div className="text-xs uppercase opacity-70">Total change ($)</div>
          <div className="text-xl tabular-nums font-semibold">
            {fmtUSD(totals.deltaValue)}
          </div>
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden">
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
                <td className="p-2">{r.name}</td>
                <td className="p-2 text-right tabular-nums">
                  {Number(r.counted_qty ?? 0).toFixed(3)}
                </td>
                <td className="p-2">{r.base_unit}</td>
                <td className="p-2 text-right tabular-nums">
                  {fmtUSD(Number(r.unit_cost ?? 0))}
                </td>
                <td className="p-2 text-right tabular-nums">
                  {fmtUSD(Number(r.counted_value_usd ?? 0))}
                </td>
                <td className="p-2 text-right tabular-nums">
                  {r.delta_base == null ? "—" : Number(r.delta_base).toFixed(3)}
                </td>
                <td className="p-2 text-right tabular-nums">
                  {fmtUSD(Number(r.delta_value_usd ?? 0))}
                </td>
              </tr>
            ))}
            {lines.length === 0 && (
              <tr>
                <td colSpan={7} className="p-3 text-neutral-400">
                  No lines recorded for this count.
                </td>
              </tr>
            )}
            {lines.length > 0 && (
              <tr className="border-t font-medium">
                <td className="p-2">Totals</td>
                <td />
                <td />
                <td />
                <td className="p-2 text-right tabular-nums">
                  {fmtUSD(totals.countedValue)}
                </td>
                <td className="p-2 text-right tabular-nums">
                  {totals.deltaAbs.toFixed(3)}
                </td>
                <td className="p-2 text-right tabular-nums">
                  {fmtUSD(totals.deltaValue)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
