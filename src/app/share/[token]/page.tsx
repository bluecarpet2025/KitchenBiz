import { createServerClient } from "@/lib/supabase/server";
import {
  costPerBaseUnit,
  buildRecipeCostIndex,
  priceFromCost,
  fmtUSD,
  type RecipeLike,
  type IngredientLine,
} from "@/lib/costing";
import SharePublicActions from "@/components/SharePublicActions";

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

  // Share → menu/tenant
  const { data: share } = await supabase
    .from("menu_shares")
    .select("menu_id, tenant_id, payload")
    .eq("token", token)
    .maybeSingle();

  if (!share) {
    return (
      <main className="max-w-3xl mx-auto p-6">
        <style>{`header{display:none!important}`}</style>
        <h1 className="text-2xl font-semibold">Shared Menu</h1>
        <p className="mt-4">This share link is invalid or has been revoked.</p>
      </main>
    );
  }

  const menuId = String(share.menu_id);
  const tenantId = String(share.tenant_id);

  // Tenant header
  const { data: t } = await supabase
    .from("tenants")
    .select("business_name,business_blurb,name")
    .eq("id", tenantId)
    .maybeSingle();
  const bizName = String(t?.business_name ?? t?.name ?? "Kitchen Biz");
  const bizBlurb = String(t?.business_blurb ?? "");

  // Menu
  const { data: menu } = await supabase
    .from("menus")
    .select("id,name,created_at")
    .eq("id", menuId)
    .maybeSingle();

  // Lines
  const { data: lines } = await supabase
    .from("menu_recipes")
    .select("recipe_id,servings,price")
    .eq("menu_id", menuId);

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

  // Ingredients
  let ing: IngredientLine[] = [];
  if (rids.length) {
    const { data } = await supabase
      .from("recipe_ingredients")
      .select("recipe_id,item_id,sub_recipe_id,qty,unit")
      .in("recipe_id", rids);
    ing = (data ?? []) as IngredientLine[];
  }

  // Item costs (use share tenant)
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

  const costIndex = buildRecipeCostIndex(recipes, ing, itemCostById);
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
      {/* Public page: hide global site header */}
      <style>{`header{display:none!important}`}</style>

      {/* Left header + actions on the right */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xl font-semibold">{bizName}</div>
          {bizBlurb && <div className="text-sm opacity-80">{bizBlurb}</div>}
          <h1 className="text-2xl font-semibold mt-2">{menu?.name || "Menu"}</h1>
        </div>
        <SharePublicActions className="print:hidden flex items-center gap-3" />
      </div>

      <div className="mt-6 border rounded-lg p-6">
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
      </div>

      <style>{`
        @media print {
          main { padding: 0 !important; }
          table { page-break-inside: avoid; }
        }
      `}</style>
    </main>
  );
}
