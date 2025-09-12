import Link from "next/link";
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

function pick<T extends object>(obj: T | null | undefined, ...keys: (keyof T)[]) {
  if (!obj) return undefined;
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null) return v as any;
  }
  return undefined;
}

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

  // Tenant header (business name/short description if available)
  let bizName = "";
  let bizBlurb = "";
  {
    const { data: t1, error } = await supabase
      .from("tenants")
      .select("business_name,business_blurb,name")
      .eq("id", menu.tenant_id)
      .maybeSingle();
    if (error) {
      const { data: t2 } = await supabase
        .from("tenants")
        .select("name")
        .eq("id", menu.tenant_id)
        .maybeSingle();
      bizName = String(t2?.name ?? "Kitchen Biz");
      bizBlurb = "";
    } else {
      bizName = String(pick(t1!, "business_name", "name") ?? "Kitchen Biz");
      bizBlurb = String(t1?.business_blurb ?? "");
    }
  }

  // Lines & recipes
  const { data: lines } = await supabase
    .from("menu_recipes")
    .select("recipe_id,servings,price")
    .eq("menu_id", menu.id);

  const rids = (lines ?? []).map((l) => String(l.recipe_id));
  let recipes: RecipeRow[] = [];
  if (rids.length) {
    const { data: recs } = await supabase
      .from("recipes")
      .select("id,name,batch_yield_qty,batch_yield_unit,yield_pct,menu_description,description")
      .in("id", rids);
    recipes = ((recs ?? []) as any[]).map((r) => ({ ...r, id: String(r.id) })) as RecipeRow[];
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
      {/* Centered header */}
      <header className="print:hidden mb-4 text-center">
        <div className="text-xl font-semibold">{bizName}</div>
        {bizBlurb && <div className="text-sm opacity-80">{bizBlurb}</div>}
        <h1 className="text-2xl font-semibold mt-2">{menu.name || "Menu"}</h1>
        <div className="mt-3 flex justify-center">
          <PrintCopyActions menuId={menu.id} />
        </div>
      </header>

      {/* Print header (also centered) */}
      <div className="hidden print:block text-center mb-4">
        <div className="text-xl font-semibold">{bizName}</div>
        {bizBlurb && <div className="text-sm opacity-80">{bizBlurb}</div>}
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
