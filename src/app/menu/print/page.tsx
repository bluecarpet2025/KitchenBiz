// src/app/menu/print/page.tsx
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import {
  costPerBaseUnit,
  costPerPortion,
  priceFromCost,
  fmtUSD,
} from "@/lib/costing";

export const dynamic = "force-dynamic";

/** Small client-only header actions (Print / Copy link) */
function HeaderActions() {
  "use client";
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      alert("Link copied to clipboard.");
    } catch {
      alert("Couldn’t copy link.");
    }
  }
  return (
    <div className="flex gap-2 print:hidden">
      <button
        onClick={() => window.print()}
        className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
      >
        Print
      </button>
      <button
        onClick={copyLink}
        className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
      >
        Copy link
      </button>
      <Link
        href="/menu"
        className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
      >
        Back to Menu
      </Link>
    </div>
  );
}

function dt(d?: string | null) {
  if (!d) return "";
  try {
    return new Date(d).toLocaleString();
  } catch {
    return "";
  }
}

/** Shapes we use locally (looser than DB types to avoid null/undefined errors) */
type RecipeRow = {
  id: string;
  name: string | null;
  batch_yield_qty: number | null;
  batch_yield_unit: string | null;
  yield_pct: number | null;
  menu_description: string | null;
};

type IngredientLine = {
  recipe_id: string | null;
  item_id: string | null;
  qty: number | null;
};

export default async function Page(props: {
  // Next 15 may pass searchParams as a Promise; accept both
  searchParams?:
    | Record<string, string | string[]>
    | Promise<Record<string, string | string[]>>;
}) {
  const sp =
    (await Promise.resolve(props.searchParams)) ??
    ({} as Record<string, string | string[]>);

  const menuIdRaw = Array.isArray(sp.menu_id) ? sp.menu_id[0] : sp.menu_id;
  const marginRaw = Array.isArray(sp.margin) ? sp.margin[0] : sp.margin;

  const menuId = (menuIdRaw ?? "").toString();
  // margin is food‑cost %, default 0.30 (30%)
  const margin = Math.min(
    0.9,
    Math.max(0, marginRaw ? Number(marginRaw) : 0.3)
  );

  const supabase = await createServerClient();

  // auth → tenant
  const { data: u } = await supabase.auth.getUser();
  const userId = u.user?.id ?? null;
  if (!userId) {
    return (
      <main className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Menu</h1>
        <p className="mt-4">You need to sign in to view this menu.</p>
        <Link className="underline" href="/login?redirect=/menu">
          Go to login
        </Link>
      </main>
    );
  }
  const { data: prof } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", userId)
    .maybeSingle();
  const tenantId = prof?.tenant_id ?? null;

  if (!tenantId || !menuId) {
    return (
      <main className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Menu</h1>
        <p className="mt-4">Missing menu or tenant.</p>
        <Link className="underline" href="/menu">
          Back to Menu
        </Link>
      </main>
    );
  }

  // menu
  const { data: menu } = await supabase
    .from("menus")
    .select("id,name,created_at,tenant_id")
    .eq("id", menuId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!menu) {
    return (
      <main className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Menu</h1>
        <p className="mt-4">Menu not found.</p>
        <Link className="underline" href="/menu">
          Back to Menu
        </Link>
      </main>
    );
  }

  // lines (we don’t show qty now, but it scopes which recipes appear)
  const { data: lines } = await supabase
    .from("menu_recipes")
    .select("recipe_id,servings")
    .eq("menu_id", menu.id);

  const rids = (lines ?? [])
    .map((l) => (l as any).recipe_id as string)
    .filter(Boolean);

  // recipes with printable description
  let recipes: RecipeRow[] = [];
  if (rids.length) {
    const { data: recs } = await supabase
      .from("recipes")
      .select(
        "id,name,batch_yield_qty,batch_yield_unit,yield_pct,menu_description"
      )
      .in("id", rids);
    recipes = (recs ?? []) as RecipeRow[];
  }

  // ingredients for those recipes
  let ingredients: IngredientLine[] = [];
  if (rids.length) {
    const { data: ing } = await supabase
      .from("recipe_ingredients")
      .select("recipe_id,item_id,qty")
      .in("recipe_id", rids);
    ingredients = (ing ?? []) as IngredientLine[];
  }

  // item costs map
  const { data: itemsRaw } = await supabase
    .from("inventory_items")
    .select("id,last_price,pack_to_base_factor")
    .eq("tenant_id", tenantId);

  const itemCostById: Record<string, number> = {};
  (itemsRaw ?? []).forEach((it: any) => {
    const id = (it.id ?? "").toString();
    if (!id) return;
    const unit = costPerBaseUnit(
      Number(it.last_price ?? 0),
      Number(it.pack_to_base_factor ?? 0)
    );
    itemCostById[id] = unit;
  });

  // group ingredients per recipe (normalize keys to strings)
  const ingByRecipe = new Map<string, IngredientLine[]>();
  (ingredients ?? []).forEach((ing) => {
    const rid = (ing.recipe_id ?? "").toString();
    if (!rid) return;
    if (!ingByRecipe.has(rid)) ingByRecipe.set(rid, []);
    ingByRecipe.get(rid)!.push(ing);
  });

  // rows for print (name, description, price)
  const rows = recipes
    .map((rec) => {
      const rid = (rec.id ?? "").toString();
      const parts = ingByRecipe.get(rid) ?? [];
      const costEach = costPerPortion(rec, parts, itemCostById);
      const price = priceFromCost(costEach, margin);

      // clean description (fallback if empty)
      const descrClean = (rec.menu_description ?? "").toString().trim();
      const descr =
        descrClean ||
        `Classic ${(rec.name ?? "item").toString().toLowerCase()}.`;

      return {
        name: rec.name ?? "Untitled",
        descr,
        price,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <main className="mx-auto p-8 max-w-4xl">
      <div className="flex items-start justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold">{menu.name || "Menu"}</h1>
          <p className="text-sm opacity-80">Created {dt(menu.created_at)}</p>
        </div>
        <HeaderActions />
      </div>

      <section className="mt-6 border rounded-lg p-6">
        {rows.length === 0 ? (
          <p className="text-neutral-400">No recipes in this menu.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="print:table-header-group bg-neutral-900/60">
              <tr>
                <th className="text-left p-2 w-[28%]">Item</th>
                <th className="text-left p-2 w-[58%]">Description</th>
                <th className="text-right p-2 w-[14%]">Price</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t align-top">
                  <td className="p-2">{r.name}</td>
                  <td className="p-2 whitespace-pre-wrap">
                    {r.descr || "—"}
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {fmtUSD(r.price)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Print styles */}
      <style>{`
        @media print {
          .print\\:hidden { display: none !important; }
          main { padding: 0 !important; }
          section { border: none !important; }
          table { page-break-inside: avoid; }
        }
      `}</style>
    </main>
  );
}
