// src/app/inventory/counts/page.tsx
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { fmtUSD } from "@/lib/costing";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  note: string | null;
  created_at: string;
  total_counted_value: number | null;
  total_abs_delta: number | null;
  total_abs_delta_value: number | null;
};

async function getTenant() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, tenantId: null };
  const { data: prof } = await supabase
    .from("profiles").select("tenant_id").eq("id", user.id).maybeSingle();
  return { supabase, user, tenantId: prof?.tenant_id ?? null };
}

export default async function CountsListPage() {
  const { supabase, user, tenantId } = await getTenant();
  if (!user || !tenantId) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Inventory Counts</h1>
        <p className="mt-4">Sign in required.</p>
        <Link className="underline" href="/login?redirect=/inventory/counts">Go to login</Link>
      </main>
    );
  }

  // Pull from view (see SQL below for the updated definition)
  const { data, error } = await supabase
    .from("v_recent_counts")
    .select("id,note,created_at,total_counted_value,total_abs_delta,total_abs_delta_value")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  const rows = (data ?? []) as Row[];

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Inventory Counts</h1>
        <Link href="/inventory/counts/new" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">New Count</Link>
      </div>

      <table className="w-full text-sm table-auto">
        <thead>
          <tr className="text-left text-neutral-300">
            <th className="p-2">When</th>
            <th className="p-2">Note</th>
            <th className="p-2 text-right">Total counted value</th>
            <th className="p-2 text-right">Total change (units)</th>
            <th className="p-2 text-right">Total change ($)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} className="border-t">
              <td className="p-2">
                <Link className="underline" href={`/inventory/counts/${r.id}`}>
                  {new Date(r.created_at).toLocaleString()}
                </Link>
              </td>
              <td className="p-2">{r.note ?? ""}</td>
              <td className="p-2 text-right tabular-nums">{fmtUSD(Number(r.total_counted_value ?? 0))}</td>
              <td className="p-2 text-right tabular-nums">{Number(r.total_abs_delta ?? 0).toFixed(3)}</td>
              <td className="p-2 text-right tabular-nums">{fmtUSD(Number(r.total_abs_delta_value ?? 0))}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td className="p-2" colSpan={5}>No counts yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
