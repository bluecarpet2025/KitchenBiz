"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import createBrowserClient from "@/lib/supabase/client"; // ✅ changed here
import { effectiveTenantId } from "@/lib/effective-tenant";
import DeleteInventoryItemButton from "@/components/DeleteInventoryItemButton";

export const dynamic = "force-dynamic";

type Item = {
  id: string;
  tenant_id: string;
  name: string;
  base_unit: string | null;
  purchase_unit: string | null;
  pack_to_base_factor: number | null;
  sku: string | null;
  par_level: number | null;
  deleted_at?: string | null;
};

export default function ManageInventoryPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    async function fetchItems() {
      const supabase = createBrowserClient(); // ✅ browser-safe
      const { tenantId, useDemo } = await effectiveTenantId();

      if (!tenantId) {
        setMessage("Sign in required, or tenant not configured.");
        setLoading(false);
        return;
      }

      const { data: itemsRaw, error } = await supabase
        .from("inventory_items")
        .select(
          "id, tenant_id, name, base_unit, purchase_unit, pack_to_base_factor, sku, par_level, deleted_at"
        )
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .order("name");

      if (error) {
        console.error("Inventory fetch error:", error);
        setMessage("Error loading inventory.");
      } else {
        setItems(itemsRaw ?? []);
      }

      setLoading(false);
    }

    fetchItems();
  }, []);

  async function handleSeed() {
    try {
      setMessage("⏳ Seeding default ingredients...");
      const res = await fetch("/api/seed-default-ingredients", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setMessage(`✅ Seeded ${data.count} default ingredients`);
      window.location.reload();
    } catch (err: any) {
      console.error(err);
      setMessage("❌ Error seeding defaults");
    }
  }

  if (loading) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Manage items</h1>
        <p className="mt-4">Loading...</p>
      </main>
    );
  }

  if (message && items.length === 0 && message.includes("Sign in")) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Manage items</h1>
        <p className="mt-4">{message}</p>
        <Link className="underline" href="/login?redirect=/inventory/manage">
          Go to login
        </Link>
      </main>
    );
  }

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Manage items</h1>
        <div className="flex gap-2">
          <Link
            href="/inventory/items/new"
            className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
          >
            New item
          </Link>
          <button
            onClick={handleSeed}
            className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
          >
            Seed Defaults
          </button>
        </div>
      </div>

      {message && <p className="text-sm text-neutral-400">{message}</p>}

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900/60">
            <tr>
              <th className="text-left p-2">Name</th>
              <th className="text-left p-2">Base</th>
              <th className="text-left p-2">Purchase</th>
              <th className="text-right p-2">Pack→Base</th>
              <th className="text-left p-2">SKU</th>
              <th className="text-right p-2">Par</th>
              <th className="text-right p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td className="p-3 text-neutral-400 text-center" colSpan={7}>
                  No items yet.
                </td>
              </tr>
            ) : (
              items.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-2">{r.name}</td>
                  <td className="p-2">{r.base_unit ?? "—"}</td>
                  <td className="p-2">{r.purchase_unit ?? "—"}</td>
                  <td className="p-2 text-right tabular-nums">
                    {r.pack_to_base_factor == null
                      ? "—"
                      : r.pack_to_base_factor.toLocaleString()}
                  </td>
                  <td className="p-2">{r.sku ?? "—"}</td>
                  <td className="p-2 text-right">{r.par_level ?? 0}</td>
                  <td className="p-2 text-right">
                    <div className="inline-flex gap-2">
                      <Link
                        href={`/inventory/items/${r.id}/edit`}
                        className="text-xs underline"
                      >
                        Edit
                      </Link>
                      <DeleteInventoryItemButton itemId={r.id} />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
