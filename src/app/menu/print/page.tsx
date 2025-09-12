import { createServerClient } from "@/lib/supabase/server";
import {
  fmtUSD,
  costPerBaseUnit,
  buildRecipeCostIndex,
  priceFromCost,
  type RecipeLike,
  type IngredientLine,
} from "@/lib/costing";

export const dynamic = "force-dynamic";

function getParam(sp: Record<string, string | string[]>, key: string) {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

function AutoPrint() {
  // tiny client island to trigger print
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: "window.addEventListener('load',()=>{setTimeout(()=>window.print(),50)});",
      }}
    />
  );
}

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[]>>;
}) {
  const sp = (await searchParams) ?? {};
  const menuId = getParam(sp, "menu_id") || "";
  const margin = Math.min(0.95, Math.max(0.05, Number(getParam(sp, "margin") ?? 0.3)));

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return (
      <main className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Menu</h1>
        <p className="mt-4">You need to sign in to view this menu.</p>
      </main>
    );
  }

  const { data: prof } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .maybeSingle();
  const tenantId = prof?.tenant_id as string | null;

  if (!tenantId || !menuId) {
    return (
      <main className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Menu</h1>
        <p className="mt-4">Missing menu or tenant.</p>
      </main>
    );
  }

  let bizName = "Kitchen Biz";
  let bizBlurb = "";
  {
    const { data: t } = await supabase
      .from("tenants")
      .select("business_name,name,short_description")
      .eq("id", tenantId)
      .maybeSingle();
    bizName = String(t?.business_name ?? t?.name ?? "Kitchen Biz");
    bizBlurb = String(t?.short_description ?? "");
  }

  const { data: menu } = await supabase
    .from("menus")
    .select("id,name,tenant_id")
    .eq("id", menuId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!menu) {
    return (
      <main className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Menu</h1>
        <p className="mt-4">Menu not found.</p>
      </main>
    );
  }

  const { data: lines } = await supabase
    .from("menu_recipes")
    .select("recipe_id, price")
    .eq("menu_id", menu.id);

  const rids = (lines ?? []).map((l) => String(l.recipe_id));

  let recipes: (RecipeLike & {
    id: string;
    name: string | null;
    menu_description: string | null;
    description?: string | null;
  })[] = [];

  if (rids.length) {
    const { data: recs } = await supabase
      .from("recipes")
      .select(
        "id,name,batch_yield_qty,batch_yield_unit,yield_pct,menu_description,description"
      )
      .in("id", rids);
    recipes = ((recs ?? []) as any[]).map((r) => ({ ...r, id: String(r.id) }));
  }

  let ing: IngredientLine[] = [];
  if (rids.length) {
    const { data } = await supabase
      .from("recipe_ingredients")
      .select("recipe_id,item_id,sub_recipe_id,qty,unit")
      .in("recipe_id", rids);
    ing = (data ?? []) as IngredientLine[];
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

  const costIndex = buildRecipeCostIndex(recipes, ing, itemCostById);
  const rows = recipes
    .map((rec) => {
      const costEach = costIndex[rec.id] ?? 0;
      const override = Number((lines ?? []).find((l) => String(l.recipe_id) === rec.id)?.price ?? 0);
      const price = override > 0 ? override : priceFromCost(costEach, margin);
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
      <AutoPrint />
      <div className="text-center">
        <div className="text-xl font-semibold">{bizName}</div>
        {bizBlurb && <div className="text-sm opacity-80">{bizBlurb}</div>}
        <h1 className="text-2xl font-semibold mt-2">{menu?.name || "Menu"}</h1>
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
