import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { fmtUSD } from "@/lib/costing";
import { fmtQty } from "@/lib/format";

export const dynamic = "force-dynamic";

type Recipe = {
  id: string;
  name?: string | null;
  description?: string | null;
  // aliased from batch_yield_* below
  yield_qty?: number | null;
  yield_unit?: string | null;
  yield_pct?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type RecipeIngredient = {
  id?: string;
  recipe_id?: string;
  item_id?: string | null;
  qty?: number | null;
  unit?: string | null;
  // tolerate historical alias columns
  quantity?: number | null;
  measure_unit?: string | null;
  qty_base?: number | null;
  base_unit?: string | null;
};

type Item = { id: string; name?: string | null; base_unit?: string | null };

type AvgCost = {
  item_id: string;
  avg_unit_cost?: number | null;
  avg_cost_per_base?: number | null;
  avg_per_base?: number | null;
  unit_cost_base?: number | null;
};

function pick(obj: Record<string, any> | null | undefined, ...keys: string[]) {
  if (!obj) return undefined;
  for (const k of keys) {
    const v = (obj as any)[k];
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
}
function pickCost(c?: AvgCost | null): number {
  if (!c) return 0;
  return Number(
    pick(c, "avg_unit_cost", "avg_cost_per_base", "avg_per_base", "unit_cost_base") ?? 0
  );
}

/** Render a friendly message instead of a hard 404 so we can debug RLS/tenant issues. */
export default async function RecipeDetailPage(props: any) {
  // Normalize params (Next can pass a thenable in some environments)
  const raw = props?.params;
  const params: { id?: string } =
    raw && typeof raw.then === "function" ? await raw : raw ?? {};
  const id = params?.id as string | undefined;

  const supabase = await createServerClient();

  // 1) Load recipe (alias batch_yield_* -> yield_*)
  let recipe: Recipe | null = null;
  let recipeErrMsg: string | null = null;

  if (!id) {
    recipeErrMsg = "No recipe id in URL.";
  } else {
    const { data: recipeRow, error: recipeErr } = await supabase
      .from("recipes")
      .select(
        [
          "id",
          "name",
          "description",
          "yield_qty:batch_yield_qty",
          "yield_unit:batch_yield_unit",
          "yield_pct",
          "created_at",
          "updated_at",
        ].join(",")
      )
      .eq("id", id)
      .maybeSingle();

    if (recipeErr) {
      console.error("recipes fetch error:", recipeErr);
      recipeErrMsg = recipeErr.message ?? "Failed to fetch recipe.";
    }
    // <-- Relax typing here to satisfy TS (the runtime shape is fine)
    recipe = (recipeRow as unknown as Recipe) ?? null;

    if (!recipe && !recipeErrMsg) {
      recipeErrMsg =
        "Recipe not found or you don’t have access (tenant/RLS). It may also be deleted.";
    }
  }

  if (!recipe) {
    return (
      <main className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold">Recipe</h1>
          <Link
            href="/recipes"
            className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
          >
            Back to recipes
          </Link>
        </div>

        <div className="border rounded-lg p-4 bg-neutral-950">
          <div className="text-lg font-medium mb-1">Not available</div>
          <p className="text-sm text-neutral-400">
            {recipeErrMsg ??
              "This recipe could not be loaded. If it should exist, check demo toggle and tenant access."}
          </p>
        </div>
      </main>
    );
  }

  // 2) Ingredients
  const { data: ri, error: ingErr } = await supabase
    .from("recipe_ingredients")
    .select("*")
    .eq("recipe_id", recipe.id);

  if (ingErr) console.error("recipe_ingredients fetch error:", ingErr);

  const ingredients: RecipeIngredient[] = (ri ?? []).map((r: any) => ({
    id: r.id,
    recipe_id: r.recipe_id,
    item_id: r.item_id ?? r.inventory_item_id ?? r.ingredient_id ?? null,
    qty:
      r.qty ??
      r.quantity ??
      (typeof r.qty_base === "number" ? r.qty_base : null) ??
      null,
    unit: r.unit ?? r.measure_unit ?? r.base_unit ?? null,
  }));

  // 3) Item lookup
  const itemIds = Array.from(
    new Set(ingredients.map((x) => x.item_id).filter(Boolean).map(String))
  );
  const itemsById = new Map<string, Item>();
  if (itemIds.length) {
    const { data: items, error: itemsErr } = await supabase
      .from("inventory_items")
      .select("id,name,base_unit")
      .in("id", itemIds);
    if (itemsErr) console.error("inventory_items fetch error:", itemsErr);
    (items ?? []).forEach((it: any) =>
      itemsById.set(String(it.id), {
        id: String(it.id),
        name: it.name,
        base_unit: it.base_unit,
      })
    );
  }

  // 4) Avg cost lookup (optional)
  const costByItem = new Map<string, AvgCost>();
  if (itemIds.length) {
    const { data: costs, error: costsErr } = await supabase
      .from("v_item_avg_costs")
      .select("item_id,avg_unit_cost,avg_cost_per_base,avg_per_base,unit_cost_base")
      .in("item_id", itemIds);
    if (costsErr) console.error("v_item_avg_costs fetch error:", costsErr);
    (costs ?? []).forEach((c: any) =>
      costByItem.set(String(c.item_id), {
        item_id: String(c.item_id),
        avg_unit_cost: c.avg_unit_cost,
        avg_cost_per_base: c.avg_cost_per_base,
        avg_per_base: c.avg_per_base,
        unit_cost_base: c.unit_cost_base,
      })
    );
  }

  // 5) Present rows
  const rows = ingredients.map((ing) => {
    const item = itemsById.get(String(ing.item_id)) ?? {
      id: String(ing.item_id ?? ""),
      name: "(item)",
      base_unit: "",
    };
    const qty = Number(ing.qty ?? 0);
    const unit = (ing.unit ?? item.base_unit ?? "") as string;
    const cost = pickCost(costByItem.get(String(ing.item_id)));
    const lineCost = qty * cost;
    return {
      itemName: item.name ?? "(item)",
      unit,
      qty,
      unitCost: cost,
      lineCost,
      itemId: String(ing.item_id ?? ""),
    };
  });

  const totals = rows.reduce(
    (acc, r) => {
      acc.totalQty += r.qty;
      acc.totalCost += r.lineCost;
      return acc;
    },
    { totalQty: 0, totalCost: 0 }
  );

  rows.sort((a, b) => a.itemName.localeCompare(b.itemName));

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{recipe.name || "Recipe"}</h1>
          <p className="text-sm text-neutral-400">
            {recipe.description ?? "No description."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/recipes"
            className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
          >
            Back to recipes
          </Link>
          {/* <Link href={`/recipes/${recipe.id}/edit`} className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">Edit</Link> */}
        </div>
      </div>

      {/* Meta */}
      <div className="grid md:grid-cols-3 gap-3">
        <div className="border rounded-lg p-3">
          <div className="text-xs opacity-75">YIELD</div>
          <div className="text-xl font-semibold tabular-nums">
            {fmtQty(Number(recipe.yield_qty ?? 0))}{" "}
            <span className="text-base opacity-80">{recipe.yield_unit ?? ""}</span>
          </div>
        </div>
        <div className="border rounded-lg p-3">
          <div className="text-xs opacity-75">INGREDIENT LINES</div>
          <div className="text-xl font-semibold tabular-nums">{rows.length}</div>
        </div>
        <div className="border rounded-lg p-3">
          <div className="text-xs opacity-75">EST. COST (SUM)</div>
          <div className="text-xl font-semibold">{fmtUSD(totals.totalCost)}</div>
        </div>
      </div>

      {/* Ingredients */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900/60">
            <tr>
              <th className="p-2 text-left">Item</th>
              <th className="p-2 text-right">Qty</th>
              <th className="p-2 text-left">Unit</th>
              <th className="p-2 text-right">$ / unit</th>
              <th className="p-2 text-right">Line cost</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.itemId} className="border-t">
                <td className="p-2">{r.itemName}</td>
                <td className="p-2 text-right tabular-nums">{fmtQty(r.qty)}</td>
                <td className="p-2">{r.unit}</td>
                <td className="p-2 text-right tabular-nums">
                  {r.unitCost ? fmtUSD(r.unitCost) : "$0.00"}
                </td>
                <td className="p-2 text-right tabular-nums">{fmtUSD(r.lineCost)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="p-3 text-neutral-400" colSpan={5}>
                  No ingredients found for this recipe.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot className="bg-neutral-900/40">
            <tr>
              <td className="p-2 font-medium">Totals</td>
              <td className="p-2 text-right font-medium tabular-nums">
                {fmtQty(totals.totalQty)}
              </td>
              <td className="p-2" />
              <td className="p-2" />
              <td className="p-2 text-right font-medium tabular-nums">
                {fmtUSD(totals.totalCost)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Timestamps */}
      <div className="text-xs text-neutral-500">
        <div>Created: {recipe.created_at ? new Date(recipe.created_at).toLocaleString() : "—"}</div>
        <div>Updated: {recipe.updated_at ? new Date(recipe.updated_at).toLocaleString() : "—"}</div>
        <div className="mt-2">Recipe ID: <code className="select-all">{recipe.id}</code></div>
      </div>
    </main>
  );
}
