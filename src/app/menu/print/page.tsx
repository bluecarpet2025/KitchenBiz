// src/app/menu/print/page.tsx
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { costPerBaseUnit, costPerPortion, priceFromCost, fmtUSD } from "@/lib/costing";

export const dynamic = "force-dynamic";

/** Tiny client-only button so the page can call window.print() */
function PrintBtn() {
  "use client";
  return (
    <button
      onClick={() => window.print()}
      className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900 print:hidden"
    >
      Print
    </button>
  );
}

type RecipeRow = {
  id: string;
  name: string | null;
  batch_yield_qty: number | null;
  batch_yield_unit: string | null;
  yield_pct: number | null;
  menu_description: string | null; // <- optional pretty description for a printed menu
};
type IngredientRow = { recipe_id: string; item_id: string; qty: number | null };

function fmtDate(d?: string | null) {
  if (!d) return "";
  try {
    return new Date(d).toLocaleString();
  } catch {
    return "";
  }
}

export default async function Page({
  searchParams,
}: {
  // Next.js 15 passes searchParams as a Promise in the App Router
  searchParams?: Promise<Record<string, string | string[]>>;
}) {
  const sp = (await searchParams) ?? {};
  const menuId = Array.isArray(sp.menu_id) ? sp.menu_id[0] : sp.menu_id;

  // default 30% margin if none was provided
  const marginParam = Array.isArray(sp.margin) ? sp.margin[0] : sp.margin;
  const margin = Math.min(0.9, Math.max(0, marginParam ? Number(marginParam) : 0.3));

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

  // Menu header (scoped to tenant)
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

  // Lines for the chosen menu
  const { data: lines } = await supabase
    .from("menu_recipes")
    .select("recipe_id,servings")
    .eq("menu_id", menu.id);

  const rids = (lines ?? []).map((l) => l.recipe_id);
  const servingsByRecipe = new Map<string, number>();
  (lines ?? []).forEach((l) => servingsByRecipe.set(l.recipe_id, Number(l.servings ?? 0)));

  // Pull recipes (with pretty description field if present)
  let recipes: RecipeRow[] = [];
  if (rids.length) {
    const { data: recs } = await supabase
      .from("recipes")
      .select("id,name,batch_yield_qty,batch_yield_unit,yield_pct,menu_description")
      .in("id", rids);
    recipes = (recs ?? []) as RecipeRow[];
  }

  // Ingredients for those recipes
  let ingredients: IngredientRow[] = [];
  if (rids.length) {
    const { data: ing } = await supabase
      .from("recipe_ingredients")
      .select("recipe_id,item_id,qty")
      .in("recipe_id", rids);
    ingredients = (ing ?? []) as IngredientRow[];
  }

  // Base-unit costs by item
  const { data: itemsRaw } = await supabase
    .from("inventory_items")
    .select("id,last_price,pack_to_base_factor")
    .eq("tenant_id", tenantId);

  // 🔧 IMPORTANT: name must be itemCostById (not itemsById)
  const itemCostById: Record<string, number> = {};
  (itemsRaw ?? []).forEach((it: any) => {
    itemCostById[it.id] = costPerBaseUnit(
      Number(it.last_price ?? 0),
      Number(it.pack_to_base_factor ?? 0)
    );
  });

  // Group ingredients by recipe
  const ingByRecipe = new Map<string, IngredientRow[]>();
  (ingredients ?? []).forEach((ing) => {
    if (!ingByRecipe.has(ing.recipe_id)) ingByRecipe.set(ing.recipe_id, []);
    ingByRecipe.get(ing.recipe_id)!.push(ing);
  });

  // Build printable rows: item + description + price (no qty, no totals)
  const rows = recipes
    .map((rec) => {
      const parts = ingByRecipe.get(rec.id) ?? [];
      const costEach = costPerPortion(rec, parts, itemCostById);
      const priceEach = priceFromCost(costEach, margin);
      return {
        name: rec.name ?? "Untitled",
        desc: (rec.menu_description ?? "").trim(),
        price: priceEach,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <main className="mx-auto p-8 max-w-3xl">
      {/* Header (hidden when printing) */}
      <div className="flex items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold">{menu.name || "Menu"}</h1>
          <p className="text-sm opacity-80">Created {fmtDate(menu.created_at)}</p>
        </div>
        <div className="flex gap-2">
          <PrintBtn />
          <Link href="/menu" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
            Back to Menu
          </Link>
        </div>
      </div>

      {/* Pretty, customer-facing list */}
      <section className="mt-6 border rounded-lg p-6">
        {rows.length === 0 ? (
          <p className="text-neutral-400">No recipes in this menu.</p>
        ) : (
          <ul className="space-y-5">
            {rows.map((r, i) => (
              <li key={i} className="border-b last:border-none pb-4">
                <div className="flex items-baseline justify-between gap-4">
                  <div className="text-lg font-medium">{r.name}</div>
                  <div className="text-lg tabular-nums">{fmtUSD(r.price)}</div>
                </div>
                {r.desc && (
                  <p className="text-sm opacity-80 mt-1 leading-6 whitespace-pre-line">
                    {r.desc}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Print tweaks */}
      <style>{`
        @media print {
          .print\\:hidden { display: none !important; }
          main { padding: 0 !important; }
          section { border: none !important; }
        }
      `}</style>
    </main>
  );
}
