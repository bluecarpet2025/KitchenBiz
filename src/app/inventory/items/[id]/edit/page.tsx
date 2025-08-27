// src/app/inventory/items/[id]/edit/page.tsx
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Item = {
  id: string;
  tenant_id: string;
  name: string;
  base_unit: string | null;
  purchase_unit: string | null;
  pack_size_desc: string | null;
  pack_to_base_factor: number | null;
  par_level: number | null;
  sku: string | null;
};

export default async function EditItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createServerClient();

  // auth
  const { data: u } = await supabase.auth.getUser();
  const user = u.user ?? null;
  if (!user) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Edit Item</h1>
        <p className="mt-4">Sign in required.</p>
        <Link className="underline" href="/login?redirect=/inventory/manage">
          Go to login
        </Link>
      </main>
    );
  }

  // tenant
  const { data: prof } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  const tenantId = prof?.tenant_id ?? null;
  if (!tenantId) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Edit Item</h1>
        <p className="mt-4">Profile is missing a tenant.</p>
        <Link className="underline" href="/inventory/manage">
          Back to items
        </Link>
      </main>
    );
  }

  // load the item (scoped to tenant)
  const { data: item, error } = await supabase
    .from("inventory_items")
    .select(
      "id,tenant_id,name,base_unit,purchase_unit,pack_size_desc,pack_to_base_factor,par_level,sku"
    )
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();

  if (error || !item) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Edit Item</h1>
        <p className="mt-4">Item not found.</p>
        <Link className="underline" href="/inventory/manage">
          Back to items
        </Link>
      </main>
    );
  }

  const it = item as Item;

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Edit Item</h1>
        <Link
          href="/inventory/manage"
          className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
        >
          Back to items
        </Link>
      </div>

      <form
        action={`/inventory/items/${it.id}/edit`}
        method="post"
        className="space-y-4"
      >
        <div>
          <label className="block text-sm mb-1">Name</label>
          <input
            name="name"
            defaultValue={it.name ?? ""}
            className="w-full bg-black/20 border rounded p-2"
            required
          />
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm mb-1">Base unit</label>
            <input
              name="base_unit"
              placeholder="g / ml / each / lb / etc."
              defaultValue={it.base_unit ?? ""}
              className="w-full bg-black/20 border rounded p-2"
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Purchase unit</label>
            <input
              name="purchase_unit"
              placeholder="kg / l / case / each / etc."
              defaultValue={it.purchase_unit ?? ""}
              className="w-full bg-black/20 border rounded p-2"
            />
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm mb-1">Pack–&gt;Base (integer)</label>
            <input
              name="pack_to_base_factor"
              type="number"
              step="1"
              min="0"
              defaultValue={it.pack_to_base_factor ?? 0}
              className="w-full bg-black/20 border rounded p-2"
            />
            <p className="text-xs opacity-70 mt-1">
              How many <em>base units</em> per one purchase unit.
            </p>
          </div>
          <div>
            <label className="block text-sm mb-1">SKU</label>
            <input
              name="sku"
              defaultValue={it.sku ?? ""}
              className="w-full bg-black/20 border rounded p-2"
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Par level</label>
            <input
              name="par_level"
              type="number"
              step="1"
              min="0"
              defaultValue={it.par_level ?? 0}
              className="w-full bg-black/20 border rounded p-2"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm mb-1">Pack size (description)</label>
          <input
            name="pack_size_desc"
            placeholder='e.g. "24", "1,000", "50", etc.'
            defaultValue={it.pack_size_desc ?? ""}
            className="w-full bg-black/20 border rounded p-2"
          />
        </div>

        <div className="pt-2">
          <button
            type="submit"
            className="px-4 py-2 border rounded-md text-sm hover:bg-neutral-900"
          >
            Save
          </button>
        </div>
      </form>
    </main>
  );
}
