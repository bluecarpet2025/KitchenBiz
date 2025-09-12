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
import PrintCopyActions from "@/components/PrintCopyActions";

export const dynamic = "force-dynamic";

type RecipeRow = RecipeLike & {
  id: string;
  name: string | null;
  menu_description: string | null;
  description?: string | null;
};

export default async function Page({ searchParams }: { searchParams?: Promise<Record<string, string | string[]>> }) {
  const sp = (await searchParams) ?? {};
  const menuId = Array.isArray(sp.menu_id) ? sp.menu_id[0] : sp.menu_id;
  const marginParam = Array.isArray(sp.margin) ? sp.margin[0] : sp.margin;
  const margin = Math.min(0.9, Math.max(0, marginParam ? Number(marginParam) : 0.3));

  const supabase = await createServerClient();
  const { data: u } = await supabase.auth.getUser();
  const userId = u.user?.id ?? null;

  if (!userId) {
    return (
      <main className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Menu</h1>
        <p className="mt-4">You need to sign in to view this menu.</p>
        <Link className="underline" href="/login?redirect=/menu">Go to login</Link>
        <style>{`header{display:none!important}`}</style>
      </main>
    );
  }

  const { data: prof } = await supabase
    .from("profiles")
    .select("tenant_id,business_name,business_tagline")
    .eq("id", userId)
    .maybeSingle();
  const tenantId = prof?.tenant_id ?? null;

  if (!tenantId || !menuId) {
    return (
      <main className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Menu</h1>
        <p className="mt-4">Missing menu or tenant.</p>
        <Link className="underline" href="/menu">Back to Menu</Link>
        <style>{`header{display:none!important}`}</style>
      </main>
    );
  }

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
        <style>{`header{display:none!important}`}</style>
      </main>
    );
  }

  // Lines
  const { data: lines } = await supabase
    .from("menu_recipes")
    .select("recipe_id,servings")
    .eq("menu_id", menu.id);
  const rids = (lines ?? []).map(l => String(l.recipe_id));

  // Recipes (include description fields)
  let recipes: RecipeRow[] = [];
  if (rids.length) {
    const { data: recs } = await supabase
      .from("recipes")
      .select("id,name,batch_yield_qty,batch_yield_unit,yield_pct,menu_description,description")
      .in("id", rids);
    recipes = ((recs ?? []) as any[]).map(r => ({ ...r, id: String(r.id) })) as RecipeRow[];
  }

  // Ingredients (per recipe)
  let ingredients: IngredientLine[] = [];
  if (rids.length) {
    const { data: ing } = await supabase
      .from("recipe_ingredients")
      .select("recipe_id,item_id,qty")
      .in("recipe_id", rids);
    ingredients = (ing ?? []) as IngredientLine[];
  }

  // Item costs
  const { data: itemsRaw } = await supabase
    .from("inventory_items")
    .select("id,last_price,pack_to_base_factor")
    .eq("tenant_id", tenantId);
  const itemCostById: Record<string, number> = {};
  (itemsRaw ?? []).forEach((it: any) => {
    itemCostById[String(it.id)] = costPerBaseUnit(
      Number(it.last_price ?? 0),
      Number(it.pack_to_base_factor ?? 0)
    );
  });

  // Group ingredients per recipe (skip malformed keys)
  const ingByRecipe = new Map<string, IngredientLine[]>();
  (ingredients ?? []).forEach(ing => {
    const key = String((ing as any).recipe_id ?? "");
    if (!key) return;
    if (!ingByRecipe.has(key)) ingByRecipe.set(key, []);
    ingByRecipe.get(key)!.push(ing);
  });

  const rows = recipes
    .map(rec => {
      const parts = ingByRecipe.get(String(rec.id)) ?? [];
      const costEach = costPerPortion(rec, parts, itemCostById);
      const price = priceFromCost(costEach, margin);
      const descrRaw =
        String(rec.menu_description ?? rec.description ?? "").trim() ||
        `Classic ${String(rec.name ?? "item").toLowerCase()}.`;
      return {
        name: String(rec.name ?? "Untitled"),
        descr: descrRaw,
        price,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const businessName = prof?.business_name ?? null;
  const businessTagline = prof?.business_tagline ?? null;

  return (
    <main className="mx-auto p-8 max-w-4xl">
      {/* Hide the global TopNav on this page entirely */}
      <style>{`header{display:none!important}`}</style>

      {/* Centered header */}
      <div className="print:hidden flex items-center justify-center mb-4">
        <PrintCopyActions
          menuId={String(menu.id)}
          businessName={businessName}
          businessTagline={businessTagline}
        />
      </div>

      <div className="text-center mb-4">
        {businessName && <div className="text-2xl font-semibold">{businessName}</div>}
        {businessTagline && <div className="opacity-80">{businessTagline}</div>}
        <h1 className="text-2xl font-semibold mt-2">{menu.name || "Menu"}</h1>
      </div>

      <section className="mt-2 border rounded-lg p-6">
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
                  <td className="p-2 whitespace-pre-wrap">{r.descr}</td>
                  <td className="p-2 text-right tabular-nums">{fmtUSD(r.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Print CSS adjustments */}
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
