import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { getEffectiveTenant } from "@/lib/effective-tenant";
import SalesEditorClient from "@/components/SalesEditorClient";

export const dynamic = "force-dynamic";

export default async function SalesManagePage() {
  const supabase = await createServerClient();
  const tenantId = await getEffectiveTenant(supabase);
  if (!tenantId) {
    return (
      <main className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Sales — Manage</h1>
        <p className="mt-2">Profile missing tenant.</p>
      </main>
    );
  }

  const { data } = await supabase
    .from("sales_order_lines")
    .select("id, product_name, qty, unit_price, order_id, sales_orders!inner(occurred_at)")
    .eq("tenant_id", tenantId)
    .order("id", { ascending: false })
    .limit(200);

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Sales — Manage</h1>
        <div className="flex gap-2">
          <Link href="/sales" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
            Back to Sales
          </Link>
        </div>
      </div>
      <SalesEditorClient initialRows={(data ?? []) as any[]} />
    </main>
  );
}
