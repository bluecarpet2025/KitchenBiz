// src/app/inventory/counts/page.tsx
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { fmtUSD } from "@/lib/costing";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  note: string | null;
  created_at: string;
  total_abs_delta: number | null;
  total_value_usd: number | null;
  tenant_id?: string;
};

export default async function CountsListPage() {
  const supabase = await createServerClient();

  // auth → tenant
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

  // use the view
  const { data, error } = await supabase
    .from("v_recent_counts")
    .select("id,note,created_at,total_abs_delta,total_value_usd")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const rows = (data ?? []) as Row[];

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
            <th className="p-2 text-right">Value ($)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="p-2">
                <Link href={`/inventory/counts/${r.id}`} className="underline">
                  {new Date(r.created_at).toLocaleString()}
                </Link>
              </td>
              <td className="p-2">{r.note ?? ""}</td>
              <td className="p-2 text-right tabular-nums">
                {Number(r.total_abs_delta ?? 0).toFixed(3)}
              </td>
              <td className="p-2 text-right tabular-nums">
                {fmtUSD(Number(r.total_value_usd ?? 0))}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td className="p-2" colSpan={4}>
                No counts yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
