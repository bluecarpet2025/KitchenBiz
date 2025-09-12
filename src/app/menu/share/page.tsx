import { createServerClient } from "@/lib/supabase/server";
import {
  costPerBaseUnit,
  buildRecipeCostIndex,
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

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[]>>;
}) {
  const sp = (await searchParams) ?? {};
  const menuId = Array.isArray(sp.menu_id) ? sp.menu_id[0] : sp.menu_id;
  const marginParam = Array.isArray(sp.margin) ? sp.margin[0] : sp.margin;
  const margin = Math.min(0.9, Math.max(0, marginParam ? Number(marginParam) : 0.3));

  const supabase = await createServerClient();

  // Auth required for internal share page
  const { data: u } = await supabase.auth.getUser();
  if (!u.user?.id) {
    return (
      <main className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Menu</h1>
        <p className="mt-4">You need to sign in to view this page.</p>
      </main>
    );
  }

  // Fetch menu by id (RLS-enforced)
  const { data: menu } = await supabase
    .from("menus")
    .select("id,name,tenant_id,created_at")
    .eq("id", String(menuId ?? ""))
    .maybeSingle();
  if (!menu) {
    return (
      <main className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Menu</h1>
        <p className="mt-4">Menu not found.</p>
      </main>
    );
  }

  // Tenant header info
  const { data: t } = await supabase
    .from("tenants")
    .select("business_name,business_blurb,name")
    .eq("id", menu.tenant_id)
    .maybeSingle();
  const bizName = String(t?.business_name ?? t?.name ?? "Kitchen Biz");
  const bizBlurb = String(t?.business_blurb ?? "");

  // Menu lines
  const { data: lines } = await supabase
    .from("menu_recipes")
    .select("recipe_id,servings,price")
    .eq("menu_id", menu.id);

  const rids = (lines ?? []).map((l) => String(l.recipe_id));

  // Recipes
  let recipes: RecipeRow[] = [];
  if (rids.length) {
    const { data: recs } = await supabase
      .from("recipes")
      .select(
        "id,name,batch_yield_qty,batch_yield_unit,yield_pct,menu_description,description"
      )
      .in("id", rids);
    recipes = ((recs ?? []) as any[]).map((r) => ({ ...r, id: String(r.id) })) as RecipeRow[];
  }

  // Ingredients (support sub-recipes)
  let ingredients: IngredientLine[] = [];
  if (rids.length) {
    const { data: ing } = await supabase
      .from("recipe_ingredients")
      .select("recipe_id,item_id,sub_recipe_id,qty,unit")
      .in("recipe_id", rids);
    ingredients = (ing ?? []) as IngredientLine[];
  }

  // Item costs
  const { data: itemsRaw } = await supabase
    .from("inventory_items")
    .select("id,last_price,pack_to_base_factor")
    .eq("tenant_id", menu.tenant_id);
  const itemCostById: Record<string, number> = {};
  (itemsRaw ?? []).forEach((it: any) => {
    itemCostById[String(it.id)] = costPerBaseUnit(
      Number(it.last_price ?? 0),
      Number(it.pack_to_base_factor ?? 0)
    );
  });

  // Pricing rows
  const costIndex = buildRecipeCostIndex(recipes, ingredients, itemCostById);
  const rows = recipes
    .map((rec) => {
      const costEach = costIndex[rec.id] ?? 0;
      const override = Number((lines ?? []).find((l) => String(l.recipe_id) === rec.id)?.price ?? 0);
      const suggested = priceFromCost(costEach, margin);
      const price = override > 0 ? override : suggested;
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

  return (
    <main className="mx-auto p-8 max-w-4xl">
      {/* Left header, actions on right, top-nav visible */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xl font-semibold">{bizName}</div>
          {bizBlurb && <div className="text-sm opacity-80">{bizBlurb}</div>}
          <h1 className="text-2xl font-semibold mt-2">{menu.name || "Menu"}</h1>
        </div>
        <div className="print:hidden">
          <PrintCopyActions menuId={String(menu.id)} />
        </div>
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
                  <td className="p-2 whitespace-pre-wrap">{r.descr}</td>
                  <td className="p-2 text-right tabular-nums">{fmtUSD(r.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
