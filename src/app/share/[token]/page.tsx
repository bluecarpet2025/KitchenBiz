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

function getParam(sp: Record<string, string | string[]>, key: string) {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

export default async function PublicSharePage(
  props: { params?: Promise<{ token: string }>; searchParams?: Promise<Record<string, string | string[]>> }
) {
  const { token } = (await props.params) ?? { token: "" };
  const sp = (await props.searchParams) ?? {};
  const margin = Math.min(0.9, Math.max(0, Number(getParam(sp, "margin") ?? 0.3)));

  const supabase = await createServerClient();

  // token -> (tenant_id, menu_id)
  const { data: share } = await supabase
    .from("menu_shares")
    .select("menu_id, tenant_id")
    .eq("token", token)
    .maybeSingle();
  if (!share) {
    return (
      <main className="max-w-3xl mx-auto p-6">
        <style>{`header{display:none !important}`}</style>
        <h1 className="text-2xl font-semibold text-center">Shared Menu</h1>
        <p className="mt-4 text-center">This share link is invalid or has been revoked.</p>
      </main>
    );
  }

  const menuId = String(share.menu_id);
  const tenantId = String(share.tenant_id);

  // Business header
  let bizName = "Kitchen Biz";
  let bizBlurb = "";
  {
    const { data: t } = await supabase
      .from("tenants")
      .select("business_name,business_blurb,name")
      .eq("id", tenantId)
      .maybeSingle();
    if (t) {
      bizName = String(t.business_name ?? t.name ?? "Kitchen Biz");
      bizBlurb = String(t.business_blurb ?? "");
    }
  }

  // Menu
  const { data: menu } = await supabase
    .from("menus")
    .select("id,name")
    .eq("id", menuId)
    .maybeSingle();

  // Lines + recipes + ingredients
  const { data: lines } = await supabase
    .from("menu_recipes")
    .select("recipe_id,servings,price")
    .eq("menu_id", menuId);
  const rids = (lines ?? []).map((l) => String(l.recipe_id));

  let recipes: RecipeRow[] = [];
  let ingredients: IngredientLine[] = [];
  if (rids.length) {
    const { data: recs } = await supabase
      .from("recipes")
      .select(
        "id,name,batch_yield_qty,batch_yield_unit,yield_pct,menu_description,description"
      )
      .in("id", rids);
    recipes = ((recs ?? []) as any[]).map((r) => ({ ...r, id: String(r.id) })) as RecipeRow[];

    const { data: ing } = await supabase
      .from("recipe_ingredients")
      .select("recipe_id,item_id,sub_recipe_id,qty,unit")
      .in("recipe_id", rids);
    ingredients = (ing ?? []) as IngredientLine[];
  }

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
      return { name: String(rec.name ?? "Untitled"), descr: descrRaw, price };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <main className="mx-auto p-8 max-w-4xl">
      {/* Hide top-nav on this public page */}
      <style>{`header{display:none !important}`}</style>

      {/* Centered header */}
      <div className="text-center mb-4">
        <div className="text-xl font-semibold">{bizName}</div>
        {bizBlurb && <div className="text-sm opacity-80">{bizBlurb}</div>}
        <h1 className="text-2xl font-semibold mt-2">{menu?.name || "Menu"}</h1>
      </div>

      <section className="border rounded-lg p-6">
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

      <style>{`
        @media print {
          main { padding: 0 !important; }
          section { border: none !important; }
          table { page-break-inside: avoid; }
        }
      `}</style>
    </main>
  );
}
