import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { fmtUSD } from "@/lib/costing";
import { fmtQty } from "@/lib/format";
import { getEffectiveTenant } from "@/lib/effective-tenant";
import DeleteInventoryItemButton from "@/components/DeleteInventoryItemButton";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

type Item = {
  id: string;
  name: string;
  base_unit: string | null;
  purchase_unit: string | null;
  pack_to_base_factor: number | null;
  deleted_at?: string | null;
};

type Onhand = { item_id: string; qty_on_hand_base: number | null };
type ReceiptRow = {
  item_id: string;
  total_cost_usd: number | null;
  qty_base: number | null;
  expires_on: string | null;
};

type Row = Item & {
  on_hand_base: number;
  avg_unit_cost: number;
  on_hand_value_usd: number;
  expires_soon: string | null;
};

const SORT_KEYS = [
  "name",
  "base",
  "purchase",
  "pack",
  "onhand",
  "avg",
  "value",
  "expiry",
] as const;
type SortKey = (typeof SORT_KEYS)[number];

function normalizeDir(d?: string): "asc" | "desc" {
  return d === "desc" ? "desc" : "asc";
}
function nextDir(d: "asc" | "desc"): "asc" | "desc" {
  return d === "asc" ? "desc" : "asc";
}

export default async function InventoryLanding({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  const sortParam = typeof sp.sort === "string" ? sp.sort : "name";
  const sort: SortKey = SORT_KEYS.includes(sortParam as SortKey)
    ? (sortParam as SortKey)
    : "name";
  const dir = normalizeDir(typeof sp.dir === "string" ? sp.dir : "asc");
  const arrow = dir === "asc" ? "▲" : "▼";

  const supabase = await createServerClient();
  const { data: u } = await supabase.auth.getUser();
  const user = u.user ?? null;

  if (!user) {
    return (
      <main className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Inventory</h1>
        <p className="mt-4">Sign in required.</p>
        <Link href="/login?redirect=/inventory" className="underline">
          Go to login
        </Link>
      </main>
    );
  }

  const tenantId = await getEffectiveTenant(supabase);
  if (!tenantId) {
    return (
      <main className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Inventory</h1>
        <p className="mt-4">Profile missing tenant.</p>
      </main>
    );
  }

  // Items (hide soft-deleted; tolerate schema without deleted_at)
  let items: Item[] = [];
  const { data: itemsTry, error: itemsErr } = await supabase
    .from("inventory_items")
    .select("id,name,base_unit,purchase_unit,pack_to_base_factor,deleted_at")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .order("name", { ascending: true });

  if (itemsErr?.code === "42703") {
    const { data } = await supabase
      .from("inventory_items")
      .select("id,name,base_unit,purchase_unit,pack_to_base_factor")
      .eq("tenant_id", tenantId)
      .order("name", { ascending: true });
    items = (data ?? []) as Item[];
  } else {
    items = (itemsTry ?? []) as Item[];
  }

  // On-hand
  const { data: onhandsRaw } = await supabase
    .from("v_inventory_on_hand")
    .select("item_id, qty_on_hand_base")
    .eq("tenant_id", tenantId);
  const onhands = (onhandsRaw ?? []) as Onhand[];
  const onhandMap = new Map(
    onhands.map((o) => [o.item_id, Number(o.qty_on_hand_base || 0)])
  );

  // Receipts (for avg $/base & earliest expiry)
  const { data: rcptsRaw } = await supabase
    .from("inventory_receipts")
    .select("item_id,total_cost_usd,qty_base,expires_on")
    .eq("tenant_id", tenantId);
  const rcpts = (rcptsRaw ?? []) as ReceiptRow[];

  const totals = new Map<string, { cost: number; qty: number }>();
  const expMap = new Map<string, string | null>();
  for (const r of rcpts) {
    const id = r.item_id;
    const cost = Number(r.total_cost_usd || 0);
    const qty = Number(r.qty_base || 0);
    const prev = totals.get(id) ?? { cost: 0, qty: 0 };
    prev.cost += cost;
    prev.qty += qty;
    totals.set(id, prev);

    if (r.expires_on) {
      const prevDate = expMap.get(id);
      if (!prevDate || new Date(r.expires_on) < new Date(prevDate)) {
        expMap.set(id, r.expires_on);
      }
    } else if (!expMap.has(id)) {
      expMap.set(id, null);
    }
  }

  const avgMap = new Map<string, number>();
  totals.forEach((v, id) => avgMap.set(id, v.qty > 0 ? v.cost / v.qty : 0));

  // Compose rows
  let rows: Row[] = items.map((i) => {
    const on = onhandMap.get(i.id) ?? 0;
    const avg = avgMap.get(i.id) ?? 0;
    const value = on * avg;
    const expiresSoon = expMap.get(i.id) ?? null;
    return {
      ...i,
      on_hand_base: on,
      avg_unit_cost: avg,
      on_hand_value_usd: value,
      expires_soon: expiresSoon,
    };
  });

  // In-memory sorting
  const m = dir === "asc" ? 1 : -1;
  rows.sort((a, b) => {
    switch (sort) {
      case "name": {
        const A = (a.name || "").toLowerCase();
        const B = (b.name || "").toLowerCase();
        return A < B ? -1 * m : A > B ? 1 * m : 0;
      }
      case "base": {
        const A = (a.base_unit || "").toLowerCase();
        const B = (b.base_unit || "").toLowerCase();
        return A < B ? -1 * m : A > B ? 1 * m : 0;
      }
      case "purchase": {
        const A = (a.purchase_unit || "").toLowerCase();
        const B = (b.purchase_unit || "").toLowerCase();
        return A < B ? -1 * m : A > B ? 1 * m : 0;
      }
      case "pack": {
        const A = a.pack_to_base_factor ?? -Infinity;
        const B = b.pack_to_base_factor ?? -Infinity;
        return A < B ? -1 * m : A > B ? 1 * m : 0;
      }
      case "onhand": {
        const A = a.on_hand_base ?? 0;
        const B = b.on_hand_base ?? 0;
        return A < B ? -1 * m : A > B ? 1 * m : 0;
      }
      case "avg": {
        const A = a.avg_unit_cost ?? 0;
        const B = b.avg_unit_cost ?? 0;
        return A < B ? -1 * m : A > B ? 1 * m : 0;
      }
      case "value": {
        const A = a.on_hand_value_usd ?? 0;
        const B = b.on_hand_value_usd ?? 0;
        return A < B ? -1 * m : A > B ? 1 * m : 0;
      }
      case "expiry": {
        const A = a.expires_soon ? new Date(a.expires_soon).getTime() : Infinity;
        const B = b.expires_soon ? new Date(b.expires_soon).getTime() : Infinity;
        return A < B ? -1 * m : A > B ? 1 * m : 0;
      }
      default:
        return 0;
    }
  });

  // KPIs
  const itemsCount = rows.length;
  const totalValue = rows.reduce((s, r) => s + Number(r.on_hand_value_usd || 0), 0);
  const nearestExpiry = rows
    .map((r) => (r.expires_soon ? new Date(r.expires_soon) : null))
    .filter((d): d is Date => !!d)
    .sort((a, b) => a.getTime() - b.getTime())[0];

  // helpers
  const sortHref = (k: SortKey) => {
    const d = sort === k ? nextDir(dir) : "asc";
    return `/inventory?sort=${k}&dir=${d}`;
  };
  const SortLabel = ({ k, label }: { k: SortKey; label: string }) => (
    <Link
      href={sortHref(k)}
      className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
      title={`Sort by ${label}`}
      prefetch={false}
    >
      {label} {sort === k && <span className="text-xs">{arrow}</span>}
    </Link>
  );

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Inventory</h1>
        <div className="flex gap-2">
          <Link href="/inventory/counts/new" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900" prefetch={false}>New count</Link>
          <Link href="/inventory/counts" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900" prefetch={false}>Counts history</Link>
          <Link href="/inventory/manage" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900" prefetch={false}>Manage items</Link>
          <Link href="/inventory/purchase" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900" prefetch={false}>Purchase</Link>
          <Link href="/inventory/receipts" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900" prefetch={false}>Receipts</Link>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="border rounded p-3">
          <div className="text-xs uppercase opacity-70">Items</div>
          <div className="text-xl font-semibold tabular-nums">{itemsCount.toLocaleString()}</div>
        </div>
        <div className="border rounded p-3">
          <div className="text-xs uppercase opacity-70">On-hand value</div>
          <div className="text-xl font-semibold tabular-nums">{fmtUSD(totalValue)}</div>
        </div>
        <div className="border rounded p-3">
          <div className="text-xs uppercase opacity-70">Nearest expiry</div>
          <div className="text-xl font-semibold">{nearestExpiry ? nearestExpiry.toLocaleDateString() : "—"}</div>
        </div>
      </div>

      <p className="text-xs opacity-70">
        Avg cost is calculated from purchases (receipts). Add receipts to update avg cost and on-hand.
        The “Pack→Base” number is formatted with commas and stored as an integer.
      </p>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900/60">
            <tr>
              <th className="p-2 text-left"><SortLabel k="name" label="Name" /></th>
              <th className="p-2 text-left"><SortLabel k="base" label="Base" /></th>
              <th className="p-2 text-left"><SortLabel k="purchase" label="Purchase" /></th>
              <th className="p-2 text-right"><SortLabel k="pack" label="Pack→Base" /></th>
              <th className="p-2 text-right"><SortLabel k="onhand" label="On hand (base)" /></th>
              <th className="p-2 text-right"><SortLabel k="avg" label="Avg $ / base" /></th>
              <th className="p-2 text-right"><SortLabel k="value" label="Value on hand" /></th>
              <th className="p-2 text-right"><SortLabel k="expiry" label="Expiring soon" /></th>
              <th className="p-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-2">{r.name}</td>
                <td className="p-2">{r.base_unit ?? "—"}</td>
                <td className="p-2">{r.purchase_unit ?? "—"}</td>
                <td className="p-2 text-right tabular-nums">
                  {r.pack_to_base_factor != null ? Number(r.pack_to_base_factor).toLocaleString() : "—"}
                </td>
                <td className="p-2 text-right tabular-nums">{fmtQty(r.on_hand_base)}</td>
                <td className="p-2 text-right tabular-nums">{fmtUSD(r.avg_unit_cost || 0)}</td>
                <td className="p-2 text-right tabular-nums">{fmtUSD(r.on_hand_value_usd || 0)}</td>
                <td className="p-2 text-right">
                  {r.expires_soon ? new Date(r.expires_soon).toLocaleDateString() : "—"}
                </td>
                <td className="p-2 text-right">
                  <div className="flex gap-1 justify-end">
                    <Link href={`/inventory/receipts?item=${encodeURIComponent(r.id)}`} className="px-2 py-1 border rounded text-xs hover:bg-neutral-900" prefetch={false}>Receipts</Link>
                    <Link href={`/inventory/receipts/new?item=${encodeURIComponent(r.id)}`} className="px-2 py-1 border rounded text-xs hover:bg-neutral-900" prefetch={false}>Add receipt</Link>
                    {/* Safe client button (no prefetch) */}
                    <DeleteInventoryItemButton id={r.id} />
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="p-3 text-neutral-400" colSpan={9}>No items yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
