import { cookies } from "next/headers";
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import NewPurchaseForm from "@/components/NewPurchaseForm";

export const dynamic = "force-dynamic";

export default async function PurchasePage() {
  const supabase = createServerClient(cookies());
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return (
      <main className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">New Purchase</h1>
        <p className="mt-4">Sign in required.</p>
        <Link href="/login?redirect=/inventory/purchase" className="underline">Go to login</Link>
      </main>
    );
  }

  const { data: profile } = await supabase.from("profiles").select("tenant_id").eq("id", user.id).single();
  const tenantId = profile?.tenant_id ?? null;

  const { data: items } = await supabase
    .from("inventory_items")
    .select("id, name, base_unit")
    .eq("tenant_id", tenantId)
    .order("name");

  return (
    <main className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">New Purchase</h1>
        <Link href="/inventory" className="text-sm underline">Back to Inventory</Link>
      </div>
      <NewPurchaseForm items={items ?? []} />
    </main>
  );
}
