import { createServerClient } from "@/lib/supabase/server";
import {
  costPerBaseUnit,
  buildRecipeCostIndex,
  priceFromCost,
  fmtUSD,
  type RecipeLike,
  type IngredientLine,
} from "@/lib/costing";

export const dynamic = "force-dynamic";

type RecipeRow = RecipeLike & {
  id: string;
  name: string | null;
  menu_description: string | null;
  description?: string | null;
};

export default async function PublicSharePage(
  props: { params?: Promise<{ token: string }>, searchParams?: Promise<Record<string, string | string[]>> }
) {
  const { token } = (await props.params) ?? { token: "" };
  const sp = (await props.searchParams) ?? {};
  const margin = Math.min(0.9, Math.max(0, Number(Array.isArray(sp.margin) ? sp.margin[0] : sp.margin ?? 0.3)));

  const supabase = await createServerClient();

  // Look up share → menu + tenant
  const { data: share } = await supabase
    .from("menu_shares")
    .select("menu_id, tenant_id")
    .eq("token", token)
    .maybeSingle();

  if (!share) {
    return (
      <main className="max-w-3xl mx-auto p-6">
        <style>{`header{display:none !important;}`}</style>
        <h1 className="text-2xl font-semibold text-center">Shared Menu</h1>
        <p className="mt-4 text-center">This share link is invalid or has been revoked.</p>
      </main>
    );
  }

  const menuId = String(share.menu_id);
  const tenantId = String(share.tenant_id);

  // Tenant header
  const { data: tenant } = await supabase
    .from("tenants")
    .select("name, short_description")
    .eq("id", tenantId)
    .maybeSingle();
  const bizName = String(tenant?.name ?? "Kiori Solutions");
  const bizBlurb = String(tenant?.short_description ?? "");

  // Menu
  const { data: menu } = await supabase
    .from("menus")
    .select("id,name")
    .eq("id", menuId)
    .maybeSingle();
  if (!menu) {
    return (
      <main className="max-w-3xl mx-auto p-6">
        <style>{`header{display:none !important;}`}</style>
        <h1 className="text-2xl font-semibold text-center">Shared Menu</h1>
        <p className="mt-4 text-center">Menu not found.</p>
      </main>
    );
  }

  // Lines (optional overrides)
  const { data: lines } = await supabase
    .from("menu_recipes")
    .select("recipe_id,price")
    .eq("menu_id", menu.id);

  const rids = (lines ?? []).map((l) => String(l.recipe_id));

  // Recipes (include descriptions)
  let recipes: RecipeRow[] = [];
  if (rids.length) {
    const { data: recs } = await supabase
      .from("recipes")
      .select("id,name,batch_yield_qty,batch_yield_unit,yield_pct,menu_description,description")
      .in("id", rids);
    recipes = ((recs ?? []) as any[]).map((r) => ({ ...r, id: String(r.id) })) as RecipeRow[];
  }

  // Ingredients
  let ing: IngredientLine[] = [];
  if (rids.length) {
    const { data } = await supabase
      .from("recipe_ingredients")
      .select("recipe_id,item_id,sub_recipe_id,qty,unit")
      .in("recipe_id", rids);
    ing = (data ?? []) as IngredientLine[];
  }

  // Inventory unit costs
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

  // Cost index (supports sub-recipes)
  const costIndex = buildRecipeCostIndex(recipes, ing, itemCostById);

  const rows = recipes
    .map((rec) => {
      const costEach = costIndex[rec.id] ?? 0;
      const override = Number((lines ?? []).find((l) => String(l.recipe_id) === rec.id)?.price ?? 0);
      const price = override > 0 ? override : priceFromCost(costEach, margin);
      const descrRaw =
        String(rec.menu_description ?? rec.description ?? "").trim() ||
        `Classic ${String(rec.name ?? "item").toLowerCase()}.`;
      return { name: String(rec.name ?? "Untitled"), descr: descrRaw, price };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <main className="mx-auto p-8 max-w-4xl">
      {/* Remove global header, center the page. No buttons here. */}
      <style>{`
        header { display: none !important; }
        @media print {
          main { padding: 0 !important; }
          table { page-break-inside: avoid; }
        }
      `}</style>

      <div className="text-center mb-4">
        <div className="text-xl font-semibold">{bizName}</div>
        {bizBlurb && <div className="text-sm opacity-80">{bizBlurb}</div>}
        <h1 className="text-2xl font-semibold mt-2">{menu.name || "Menu"}</h1>
      </div>

      <section className="border rounded-lg p-6">
        {rows.length === 0 ? (
          <p className="text-neutral-400 text-center">No recipes in this menu.</p>
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
