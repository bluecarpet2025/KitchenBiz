import { createServerClient } from "@/lib/supabase/server";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function EditItemPage({ params }: { params: { id: string } }) {
  const supabase = await createServerClient();
  const { data: u } = await supabase.auth.getUser();
  const user = u.user;
  if (!user) return <main className="max-w-4xl mx-auto p-6">Sign in required.</main>;

  const { data: prof } = await supabase.from("profiles")
    .select("tenant_id").eq("id", user.id).maybeSingle();
  const tenantId = prof?.tenant_id;

  const { data: item } = await supabase.from("inventory_items")
    .select("id,name,base_unit,purchase_unit,pack_to_base_factor,sku,par")
    .eq("tenant_id", tenantId).eq("id", params.id).maybeSingle();
  if (!item) return <main className="max-w-4xl mx-auto p-6">Not found.</main>;

  async function save(formData: FormData) {
    "use server";
    const supa = await createServerClient();
    const name = String(formData.get("name") ?? "");
    const base_unit = String(formData.get("base_unit") ?? "");
    const purchase_unit = String(formData.get("purchase_unit") ?? "");
    const pack_to_base_factor = Number(formData.get("pack_to_base_factor") ?? 1);
    const sku = (formData.get("sku") as string) || null;
    const par = Number(formData.get("par") ?? 0);

    await supa.from("inventory_items")
      .update({ name, base_unit, purchase_unit, pack_to_base_factor, sku, par })
      .eq("id", params.id);
  }

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Edit item</h1>
        <Link href="/inventory/manage" className="underline">Back to Manage</Link>
      </div>

      <form action={save} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1">
            <div className="text-sm opacity-70">Name</div>
            <input name="name" defaultValue={item.name} className="w-full px-3 py-2 rounded bg-transparent border" />
          </label>
          <label className="space-y-1">
            <div className="text-sm opacity-70">SKU</div>
            <input name="sku" defaultValue={item.sku ?? ""} className="w-full px-3 py-2 rounded bg-transparent border" />
          </label>
          <label className="space-y-1">
            <div className="text-sm opacity-70">Base unit</div>
            <input name="base_unit" defaultValue={item.base_unit} className="w-full px-3 py-2 rounded bg-transparent border" />
          </label>
          <label className="space-y-1">
            <div className="text-sm opacity-70">Purchase unit</div>
            <input name="purchase_unit" defaultValue={item.purchase_unit} className="w-full px-3 py-2 rounded bg-transparent border" />
          </label>
          <label className="space-y-1">
            <div className="text-sm opacity-70">Pack → Base</div>
            <input name="pack_to_base_factor" type="number" step="1" min="1"
              defaultValue={item.pack_to_base_factor ?? 1}
              className="w-full px-3 py-2 rounded bg-transparent border" />
          </label>
          <label className="space-y-1">
            <div className="text-sm opacity-70">Par</div>
            <input name="par" type="number" step="1" min="0"
              defaultValue={item.par ?? 0}
              className="w-full px-3 py-2 rounded bg-transparent border" />
          </label>
        </div>
        <button className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">Save</button>
      </form>
    </main>
  );
}
