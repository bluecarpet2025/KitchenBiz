import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import CountFormClient from "@/components/CountFormClient";

export const dynamic = "force-dynamic";

type Item = { id: string; name: string; base_unit: string | null };
type OnHand = { item_id: string; on_hand_base: number };

async function getTenant() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, tenantId: null };
  const { data: prof } = await supabase
    .from("profiles").select("tenant_id").eq("id", user.id).maybeSingle();
  return { supabase, user, tenantId: prof?.tenant_id ?? null };
}

export default async function NewCountPage() {
  const { supabase, user, tenantId } = await getTenant();

  if (!user || !tenantId) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">New Inventory Count</h1>
        <p className="mt-4">Sign in required.</p>
        <Link className="underline" href="/login?redirect=/inventory/counts/new">Go to login</Link>
      </main>
    );
  }

  const { data: items } = await supabase
    .from("inventory_items")
    .select("id,name,base_unit")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .order("name");

  const { data: oh } = await supabase
    .from("v_item_on_hand")
    .select("item_id,on_hand_base")
    .eq("tenant_id", tenantId);

  const onHandMap: Record<string, number> =
    Object.fromEntries((oh ?? []).map((r: OnHand) => [r.item_id, Number(r.on_hand_base || 0)]));

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">New Inventory Count</h1>
        <div className="flex gap-2">
          <Link href="/inventory/counts" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
            History
          </Link>
        </div>
      </div>

      <p className="text-sm opacity-80">
        Enter today’s physical count. On commit, differences are recorded as adjustments (loss/overage).
      </p>

      <CountFormClient
        items={(items ?? []) as Item[]}
        expected={onHandMap}
        tenantId={tenantId}
      />
    </main>
  );
}
