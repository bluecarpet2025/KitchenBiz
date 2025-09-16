import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { getEffectiveTenant } from "@/lib/effective-tenant";
import { fmtUSD } from "@/lib/costing";

export const dynamic = "force-dynamic";

type Receipt = {
  id: string;
  tenant_id: string;
  item_id: string;
  qty_base: number | null;
  total_cost_usd: number | null;
  created_at: string | null;
  note: string | null;
  photo_path: string | null;
  expires_on: string | null;
};

type Item = { id: string; name: string | null; base_unit: string | null };

export default async function ReceiptDetailPage(props: any) {
  // Normalize params to support both Promise and plain object forms
  const raw = props?.params;
  const params: { id?: string } =
    raw && typeof raw.then === "function" ? await raw : raw ?? {};
  const id = params?.id;

  const supabase = await createServerClient();

  // Auth guard (keeps layout visible instead of hard 404)
  const { data: au } = await supabase.auth.getUser();
  const user = au.user ?? null;
  if (!user) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Receipt</h1>
        <p className="mt-4">Sign in required.</p>
        <Link className="underline" href="/login?redirect=/inventory/receipts">
          Go to login
        </Link>
      </main>
    );
  }

  const tenantId = await getEffectiveTenant(supabase);
  if (!tenantId) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Receipt</h1>
        <p className="mt-4">Profile missing tenant.</p>
      </main>
    );
  }

  if (!id) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold">Receipt</h1>
          <Link href="/inventory/receipts" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
            Back to receipts
          </Link>
        </div>
        <div className="border rounded-lg p-4 bg-neutral-950">
          Missing receipt id.
        </div>
      </main>
    );
  }

  // Fetch receipt (scoped to tenant)
  const { data: rec, error: recErr } = await supabase
    .from("inventory_receipts")
    .select(
      "id,tenant_id,item_id,qty_base,total_cost_usd,created_at,note,photo_path,expires_on"
    )
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();

  if (recErr || !rec) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold">Receipt</h1>
          <Link href="/inventory/receipts" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
            Back to receipts
          </Link>
        </div>
        <div className="border rounded-lg p-4 bg-neutral-950">
          {recErr?.message ?? "Receipt not found or you don’t have access."}
        </div>
      </main>
    );
  }

  // Get item name
  let item: Item | null = null;
  if (rec.item_id) {
    const { data: it } = await supabase
      .from("inventory_items")
      .select("id,name,base_unit")
      .eq("id", rec.item_id)
      .maybeSingle();
    item = (it as Item) ?? null;
  }

  const purchased = rec.created_at
    ? new Date(rec.created_at).toLocaleDateString()
    : "—";
  const photoUrl = rec.photo_path
    ? `/api/receipt-photo?path=${encodeURIComponent(rec.photo_path)}`
    : null;

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Receipt</h1>
        <Link
          href="/inventory/receipts"
          className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
        >
          Back to receipts
        </Link>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="border rounded-lg p-4">
          <div className="text-sm opacity-75">Item</div>
          <div className="text-lg font-medium">{item?.name ?? rec.item_id}</div>
        </div>
        <div className="border rounded-lg p-4">
          <div className="text-sm opacity-75">Purchased</div>
          <div className="text-lg font-medium">{purchased}</div>
        </div>
        <div className="border rounded-lg p-4">
          <div className="text-sm opacity-75">Qty (base)</div>
          <div className="text-lg font-medium tabular-nums">
            {Number(rec.qty_base ?? 0).toLocaleString()}
          </div>
        </div>
        <div className="border rounded-lg p-4">
          <div className="text-sm opacity-75">Cost (total)</div>
          <div className="text-lg font-medium tabular-nums">
            {fmtUSD(Number(rec.total_cost_usd ?? 0))}
          </div>
        </div>
        <div className="border rounded-lg p-4">
          <div className="text-sm opacity-75">Expires on</div>
          <div className="text-lg font-medium">
            {rec.expires_on ? new Date(rec.expires_on).toLocaleDateString() : "—"}
          </div>
        </div>
        <div className="border rounded-lg p-4">
          <div className="text-sm opacity-75">Note</div>
          <div className="text-lg">{rec.note ?? "—"}</div>
        </div>
      </div>

      <div className="border rounded-lg p-4">
        <div className="text-sm opacity-75 mb-2">Photo</div>
        {photoUrl ? (
          <a className="underline" href={photoUrl} target="_blank">
            View photo
          </a>
        ) : (
          <div className="text-neutral-400">—</div>
        )}
      </div>
    </main>
  );
}
