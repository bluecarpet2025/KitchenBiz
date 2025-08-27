import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import NewReceiptForm from "./NewReceiptForm";

export const dynamic = "force-dynamic";

type ItemRow = {
  id: string;
  name: string;
  base_unit: string;
};

export default async function NewReceiptPage() {
  const supabase = await createServerClient();

  const { data: u } = await supabase.auth.getUser();
  const user = u.user ?? null;
  if (!user) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">New Purchase</h1>
        <p className="mt-4">Sign in required.</p>
        <Link className="underline" href="/login?redirect=/inventory/receipts/new">
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
        <h1 className="text-2xl font-semibold">New Purchase</h1>
        <p className="mt-4">Profile missing tenant.</p>
      </main>
    );
  }

  const { data: items } = await supabase
    .from("inventory_items")
    .select("id,name,base_unit")
    .eq("tenant_id", tenantId)
    .order("name");

  return (
    <main className="max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">New Purchase</h1>
        <Link className="underline" href="/inventory">
          Back to Inventory
        </Link>
      </div>

      <NewReceiptForm
        items={(items ?? []).map((r) => ({
          id: r.id,
          name: r.name,
          base_unit: r.base_unit,
        }))}
      />
    </main>
  );
}
