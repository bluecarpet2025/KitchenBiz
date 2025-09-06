// src/app/inventory/counts/page.tsx
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { fmtUSD } from "@/lib/costing";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  note: string | null;
  created_at: string;
  total_abs_delta: number | null;       // total change (units)
  total_abs_value_usd: number | null;   // total change ($)
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

export default async function CountsListPage() {
  const { supabase, tenantId } = await getTenant();

  if (!tenantId) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Inventory Counts</h1>
        <p className="mt-4">Sign in required or profile missing tenant.</p>
        <Link className="underline" href="/login?redirect=/inventory/counts">Go to login</Link>
      </main>
    );
  }

  // Try the view first
  const { data: viewRows, error: viewErr } = await supabase
    .from("v_recent_counts")
    .select("id, note, created_at, total_abs_delta, total_abs_value_usd")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  let rows: Row[] = [];

  if (!viewErr && viewRows) {
    rows = viewRows as Row[];
  } else {
    // Fallback: show basic count rows so the page never crashes
    const { data: counts, error: cErr } = await supabase
      .from("inventory_counts")
      .select("id, note, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });

    if (!cErr && counts) {
      rows = (counts as any[]).map((r) => ({
        id: r.id,
        note: r.note ?? null,
        created_at: r.created_at,
        total_abs_delta: null,
        total_abs_value_usd: null,
      }));
    }
  }

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Inventory Counts</h1>
        <div className="flex gap-2">
          <Link
            href="/inventory/counts/export"
            className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
          >
            Export CSV
          </Link>
          <Link
            href="/inventory/counts/new"
            className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
          >
            New Count
          </Link>
        </div>
      </div>

      <table className="w-full text-sm table-auto">
        <thead>
          <tr className="text-left text-neutral-300">
            <th className="p-2">When</th>
            <th className="p-2">Note</th>
            <th className="p-2 text-right">Total change (units)</th>
            <th className="p-2 text-right">Total change ($)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t hover:bg-neutral-900/30">
              <td className="p-2">
                <Link className="underline" href={`/inventory/counts/${r.id}`}>
                  {new Date(r.created_at).toLocaleString()}
                </Link>
              </td>
              <td className="p-2">{r.note ?? ""}</td>
              <td className="p-2 text-right tabular-nums">
                {r.total_abs_delta == null ? "—" : Number(r.total_abs_delta).toFixed(3)}
              </td>
              <td className="p-2 text-right tabular-nums">
                {r.total_abs_value_usd == null ? "—" : fmtUSD(Number(r.total_abs_value_usd))}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td className="p-2" colSpan={4}>No counts yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
