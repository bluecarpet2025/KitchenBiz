// src/app/menu/print/page.tsx
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import {
  costPerBaseUnit,
  costPerPortion,
  priceFromCost,
  fmtUSD,
  type RecipeLike,
  type IngredientLine,
} from "@/lib/costing";
import PrintCopyActions from "@/components/PrintCopyActions"; // client-only buttons

export const dynamic = "force-dynamic";

/* ---------- small helpers ---------- */
function dt(d?: string | null) {
  if (!d) return "";
  try {
    return new Date(d).toLocaleString();
  } catch {
    return "";
  }
}

type RecipeRow = RecipeLike & {
  name: string | null;
  menu_description: string | null;
};

/**
 * NOTE (Next 15): `searchParams` comes in as a Promise.
 * To avoid the PageProps constraint error, accept `any`
 * and await it explicitly.
 */
export default async function Page({ searchParams }: any) {
  // Resolve search params safely
  const sp: Record<string, string | string[]> = (await searchParams) ?? {};
  const menuIdRaw = Array.isArray(sp.menu_id) ? sp.menu_id[0] : sp.menu_id;
  const marginRaw = Array.isArray(sp.margin) ? sp.margin[0] : sp.margin;

  // Defaults: menuId -> "", margin -> 0.30 (30%)
  const menuId = String(menuIdRaw ?? "");
  const margin = Math.min(0.95, Math.max(0, marginRaw ? Number(marginRaw) : 0.3));

  const supabase = await createServerClient();

  // auth → tenant
  const { data: u } = await supabase.auth.getUser();
  const userId = u.user?.id ?? null;

  if (!userId) {
    return (
      <main className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Menu</h1>
        <p className="mt-4">You need to sign in to view this menu.</p>
        <Link className="underline" href="/login?redirect=/menu">Go to login</Link>
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
        <Link className="underline" href="/menu">Back to Menu</Link>
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
        <Link className="underline" href="/menu">Back to Menu</Link>
      </main>
    );
  }

  // lines (we filter by recipes that are in this menu)
  const { data: lines } = await supabase
    .from("menu_recipes")
    .select("recipe_id,servings")
    .eq("menu_id", menu.id);

  const recipeIds = (lines ?? []).map((l) => l.recipe_id as string);

  // recipes (include menu_description for print)
  let recipes: RecipeRow[] = [];
  if (recipeIds.length) {
    const { data: recs } = await supabase
      .from("recipes")
      .select("id,name,batch_yield_qty,batch_yield_unit,yield_pct,menu_description")
      .in("id", recipeIds);

    recipes = (recs ?? []) as RecipeRow[];
  }

  // ingredients for those recipes
  let ingredients: IngredientLine[] = [];
  if (recipeIds.length) {
    const { data: ing } = await supabase
      .from("recipe_ingredients")
      .select("recipe_id,item_id,qty")
      .in("recipe_id", recipeIds);

    ingredients = (ing ?? []) as IngredientLine[];
  }

  // item costs map
  const { data: itemsRaw } = await supabase
    .from("inventory_items")
    .select("id,last_price,pack_to_base_factor")
    .eq("tenant_id", tenantId);

  const itemCostById: Record<string, number> = {};
  (itemsRaw ?? []).forEach((it: any) => {
    const id = String(it?.id ?? "");
    const last = Number(it?.last_price ?? 0);
    const factor = Number(it?.pack_to_base_factor ?? 0);
    itemCostById[id] = costPerBaseUnit(last, factor);
  });

  // group ingredients per recipe
  const ingByRecipe = new Map<string, IngredientLine[]>();
  (ingredients ?? []).forEach((ing) => {
    const key = String(ing.recipe_id ?? "");
    if (!ingByRecipe.has(key)) ingByRecipe.set(key, []);
    ingByRecipe.get(key)!.push(ing);
  });

  // rows for print (name, description, price)
  const rows = recipes
    .map((rec) => {
      const parts = ingByRecipe.get(String(rec.id)) ?? [];
      const costEach = costPerPortion(rec, parts, itemCostById);
      const price = priceFromCost(costEach, margin);

      // description: prefer menu_description; else a polite generic
      const descr =
        (rec.menu_description ?? "").trim() ||
        `Classic ${String(rec.name ?? "item").toLowerCase()}.`;

      return {
        name: String(rec.name ?? "Untitled"),
        descr,
        price,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <main className="mx-auto p-8 max-w-4xl">
      {/* Header (actions are a client component) */}
      <div className="flex items-start justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold">{menu.name || "Menu"}</h1>
          <p className="text-sm opacity-80">Created {dt(menu.created_at)}</p>
        </div>
        <PrintCopyActions />
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
                  <td className="p-2 whitespace-pre-wrap">{r.descr || "—"}</td>
                  <td className="p-2 text-right tabular-nums">{fmtUSD(r.price)}</td>
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
