// src/app/inventory/items/new/page.tsx
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function NewInventoryItemPage() {
  const supabase = await createServerClient();
  const { data: au } = await supabase.auth.getUser();
  const user = au.user ?? null;

  if (!user) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">New inventory item</h1>
        <p className="mt-4">Sign in required.</p>
        <Link className="underline" href="/login?redirect=/inventory/items/new">
          Go to login
        </Link>
      </main>
    );
  }

  // Basic allowed unit suggestions for convenience only
  const commonUnits = ["g", "kg", "ml", "l", "lb", "each"];

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">New inventory item</h1>
        {/* You already have Inventory in the top nav, so no extra “Back” button here */}
      </div>

      <form
        method="POST"
        action="/inventory/items/new"
        className="space-y-4 border rounded-lg p-4"
      >
        <div className="grid md:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm opacity-80">Name *</span>
            <input
              required
              name="name"
              type="text"
              className="mt-1 w-full rounded-md bg-black/20 border px-3 py-2"
              placeholder="e.g., Mozzarella"
            />
          </label>

          <label className="block">
            <span className="text-sm opacity-80">SKU (optional)</span>
            <input
              name="sku"
              type="text"
              className="mt-1 w-full rounded-md bg-black/20 border px-3 py-2"
              placeholder="SKU / PLU"
            />
          </label>

          <label className="block">
            <span className="text-sm opacity-80">Base unit</span>
            <input
              list="kb-base-units"
              name="base_unit"
              type="text"
              className="mt-1 w-full rounded-md bg-black/20 border px-3 py-2"
              placeholder="e.g., g, ml, lb, each"
            />
            <datalist id="kb-base-units">
              {commonUnits.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
          </label>

          <label className="block">
            <span className="text-sm opacity-80">Purchase unit</span>
            <input
              list="kb-purchase-units"
              name="purchase_unit"
              type="text"
              className="mt-1 w-full rounded-md bg-black/20 border px-3 py-2"
              placeholder="e.g., kg, l, case"
            />
            <datalist id="kb-purchase-units">
              {commonUnits.concat(["case"]).map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
          </label>

          <label className="block">
            <span className="text-sm opacity-80">
              Pack → Base factor (integer)
            </span>
            <input
              name="pack_to_base_factor"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              className="mt-1 w-full rounded-md bg-black/20 border px-3 py-2"
              placeholder="e.g., 1000 (1 kg → 1000 g)"
            />
          </label>

          <label className="block">
            <span className="text-sm opacity-80">Par level (optional)</span>
            <input
              name="par_level"
              type="number"
              step="any"
              className="mt-1 w-full rounded-md bg-black/20 border px-3 py-2"
              placeholder="e.g., 3"
            />
          </label>
        </div>

        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
          >
            Save item
          </button>
          <Link
            href="/inventory/manage"
            className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
          >
            Cancel
          </Link>
        </div>

        <p className="text-xs opacity-70 pt-2">
          Only your personal tenant is writable. Demo tenant is read-only.
        </p>
      </form>
    </main>
  );
}
