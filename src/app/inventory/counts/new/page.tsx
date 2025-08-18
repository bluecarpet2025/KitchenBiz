// src/app/inventory/counts/new/page.tsx
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import CountForm from "@/components/CountForm";

export const dynamic = "force-dynamic";

export default async function NewCountPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">New Inventory Count</h1>
        <p className="mt-4">Sign in required.</p>
        <Link href="/login?redirect=/inventory/counts/new" className="underline">Go to login</Link>
      </main>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .single();
  const tenantId = profile?.tenant_id ?? null;

  const { data: items } = await supabase
    .from("inventory_items")
    .select("id, name, base_unit")
    .eq("tenant_id", tenantId)
    .order("name");

  const { data: expected } = await supabase
    .from("v_inventory_on_hand")
    .select("item_id, qty_on_hand")
    .eq("tenant_id", tenantId);

  const expectedMap = Object.fromEntries(
    (expected ?? []).map((e: any) => [e.item_id, Number(e.qty_on_hand || 0)])
  );

  return (
    <main className="max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">New Inventory Count</h1>
        <Link href="/inventory" className="text-sm underline">Back to Inventory</Link>
      </div>
      <p className="text-sm text-muted-foreground mt-1">
        Enter today’s physical count. On commit, differences are recorded as adjustments (loss/overage).
      </p>
      <CountForm items={items ?? []} expectedMap={expectedMap} />
    </main>
  );
}
