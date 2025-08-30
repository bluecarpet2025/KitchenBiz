import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { getEffectiveTenant } from "@/lib/effective-tenant";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const supabase = await createServerClient();

  // pick the correct tenant (own vs. demo) based on profile.use_demo
  const tenantId = await getEffectiveTenant(supabase);
  if (!tenantId) redirect("/login");

  // data
  const [{ data: items }, { data: dash }] = await Promise.all([
    supabase
      .from("inventory_items")
      .select("id,name,base_unit,sku,pack_to_base_factor")
      .eq("tenant_id", tenantId)
      .order("name"),
    supabase
      .from("v_inventory_dashboard")
      .select("*")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
  ]);

  const itemsCount = items?.length ?? 0;
  const onhandValue = dash?.onhand_value ?? 0;
  const nearestExpiry =
    dash?.nearest_expiry ??
    null; /* expect YYYY-MM-DD or null in your view; renders gracefully */

  return (
    <main className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold mb-6">Inventory</h1>

      {/* Summary */}
      <section className="grid sm:grid-cols-3 gap-4 mb-8">
        <div className="rounded-lg border border-neutral-800 p-4">
          <div className="text-sm text-neutral-400">Items</div>
          <div className="text-2xl font-semibold mt-1">{itemsCount}</div>
        </div>
        <div className="rounded-lg border border-neutral-800 p-4">
          <div className="text-sm text-neutral-400">On-hand value</div>
          <div className="text-2xl font-semibold mt-1">
            {onhandValue.toLocaleString(undefined, {
              style: "currency",
              currency: "USD",
            })}
          </div>
        </div>
        <div className="rounded-lg border border-neutral-800 p-4">
          <div className="text-sm text-neutral-400">Nearest expiry</div>
          <div className="text-2xl font-semibold mt-1">
            {nearestExpiry ?? "—"}
          </div>
        </div>
      </section>

      {/* Items table (compact) */}
      <div className="rounded-lg border border-neutral-800 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-neutral-300">
            <tr className="border-b border-neutral-800">
              <th className="text-left p-3">Name</th>
              <th className="text-left p-3">Base unit</th>
              <th className="text-left p-3">Pack→Base</th>
              <th className="text-left p-3">SKU</th>
            </tr>
          </thead>
          <tbody>
            {(items ?? []).map((i) => (
              <tr key={i.id} className="border-b border-neutral-900">
                <td className="p-3">{i.name}</td>
                <td className="p-3">{i.base_unit}</td>
                <td className="p-3">{i.pack_to_base_factor ?? "—"}</td>
                <td className="p-3">{i.sku ?? "—"}</td>
              </tr>
            ))}
            {(!items || items.length === 0) && (
              <tr>
                <td className="p-4 text-neutral-400" colSpan={4}>
                  No items yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-6">
        <Link
          href="/inventory/counts"
          className="underline underline-offset-4"
        >
          Counts history →
        </Link>
      </div>
    </main>
  );
}
