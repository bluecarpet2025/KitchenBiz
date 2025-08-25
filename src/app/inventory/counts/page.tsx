// src/app/inventory/counts/page.tsx
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type CountRow = {
  id: string;
  note: string | null;
  counted_at: string | null;
  created_at: string | null;
  status: string | null;
};

export default async function CountsListPage() {
  const supabase = await createServerClient();

  // Auth → tenant
  const { data: u } = await supabase.auth.getUser();
  const user = u.user ?? null;
  if (!user) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Inventory Counts</h1>
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
        <h1 className="text-2xl font-semibold">Inventory Counts</h1>
        <p className="mt-4">Profile missing tenant.</p>
      </main>
    );
  }

  // Read counts directly from the table (most recent first)
  const { data: counts, error: cErr } = await supabase
    .from("inventory_counts")
    .select("id,note,counted_at,created_at,status")
    .eq("tenant_id", tenantId)
    .order("counted_at", { ascending: false });

  if (cErr) throw cErr;

  const list = (counts ?? []) as CountRow[];

  // Optional: total |delta| from inventory_adjustments linked to each count
  // If a seed created counts without adjustments, totals will simply be 0/blank.
  let totalsByCount: Record<string, number> = {};
  if (list.length) {
    const ids = list.map((r) => r.id);
    const { data: adjs, error: aErr } = await supabase
      .from("inventory_adjustments")
      .select("ref_count_id, delta_base")
      .eq("tenant_id", tenantId)
      .in("ref_count_id", ids);

    if (!aErr) {
      const agg: Record<string, number> = {};
      (adjs ?? []).forEach((row: any) => {
        const id = row.ref_count_id as string;
        const d = Math.abs(Number(row.delta_base ?? 0));
        agg[id] = (agg[id] ?? 0) + d;
      });
      totalsByCount = agg;
    }
  }

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Inventory Counts</h1>
        <Link
          href="/inventory/counts/new"
          className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
        >
          New Count
        </Link>
      </div>

      <table className="w-full text-sm table-auto">
        <thead>
          <tr className="text-left text-neutral-300">
            <th className="p-2">When</th>
            <th className="p-2">Note</th>
            <th className="p-2 text-right">∑ |Δ| (base units)</th>
          </tr>
        </thead>
        <tbody>
          {list.map((r) => {
            const when = r.counted_at ?? r.created_at ?? "";
            const total = totalsByCount[r.id];
            return (
              <tr key={r.id} className="border-t">
                <td className="p-2">
                  {when ? new Date(when).toLocaleString() : "—"}
                </td>
                <td className="p-2">{r.note ?? ""}</td>
                <td className="p-2 text-right tabular-nums">
                  {total != null ? total.toFixed(3) : "—"}
                </td>
              </tr>
            );
          })}
          {list.length === 0 && (
            <tr>
              <td className="p-2" colSpan={3}>
                No counts yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
