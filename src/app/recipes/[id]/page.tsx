// src/app/recipes/[id]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { fmtUSD } from "@/lib/costing";
import { fmtQty } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * Types here are intentionally loose for resilience across schema variations.
 * We only rely on fields we actually render, and everything else is optional.
 */
type Recipe = {
  id: string;
  name?: string | null;
  description?: string | null;
  yield_qty?: number | null;
  yield_unit?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type RecipeIngredient = {
  id?: string;
  recipe_id?: string;
  item_id?: string;
  qty?: number | null;
  unit?: string | null;
  // common alternates we’ve seen in projects
  quantity?: number | null;
  measure_unit?: string | null;
};

type Item = {
  id: string;
  name?: string | null;
  base_unit?: string | null;
};

type AvgCost = {
  item_id: string;
  avg_unit_cost?: number | null; // your v_item_avg_costs column
  // tolerate a few alias names used historically
  avg_cost_per_base?: number | null;
  avg_per_base?: number | null;
  unit_cost_base?: number | null;
};

function pick(
  obj: Record<string, any> | null | undefined,
  ...keys: string[]
): any {
  if (!obj) return undefined;
  for (const k of keys) {
    const v = obj[k];
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

/** Next 15 sometimes makes `params` a Promise — normalize it safely */
async function resolveParams(maybe: any) {
  return maybe && typeof maybe.then === "function" ? await maybe : maybe;
}

export default async function RecipeDetailPage(props: any) {
  const p = await resolveParams(props?.params);
  const id = p?.id as string | undefined;
  if (!id) notFound();

  const supabase = await createServerClient();

  // 1) Load the recipe row
  const { data: recipeRow, error: recipeErr } = await supabase
    .from("recipes")
    .select("id,name,description,yield_qty,yield_unit,created_at,updated_at")
    .eq("id", id)
    .maybeSingle();

  if (recipeErr) {
    // eslint-disable-next-line no-console
    console.error("recipes fetch error:", recipeErr);
  }
  if (!recipeRow) {
    notFound();
  }
  const recipe: Recipe = recipeRow as Recipe;

  // 2) Load ingredients for this recipe (be tolerant with column names)
  // Prefer: recipe_id, item_id, qty, unit
  const { data: ri } = await supabase
    .from("recipe_ingredients")
    .select("*")
    .eq("recipe_id", id);

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

  // 3) Load item lookup (names & base units)
  const itemIds = Array.from(
    new Set(
      ingredients
        .map((x) => x.item_id)
        .filter(Boolean)
        .map((x) => String(x))
    )
  );
  let itemsById = new Map<string, Item>();
  if (itemIds.length) {
    const { data: items } = await supabase
      .from("inventory_items")
      .select("id,name,base_unit")
      .in("id", itemIds);

    (items ?? []).forEach((it: any) =>
      itemsById.set(String(it.id), {
        id: String(it.id),
        name: it.name,
        base_unit: it.base_unit,
      })
    );
  }

  // 4) Optional: cost lookup (v_item_avg_costs has avg_unit_cost)
  let costByItem = new Map<string, AvgCost>();
  if (itemIds.length) {
    const { data: costs } = await supabase
      .from("v_item_avg_costs")
      .select("item_id,avg_unit_cost,avg_cost_per_base,avg_per_base,unit_cost_base")
      .in("item_id", itemIds);

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

  // 5) Presentable rows with totals
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

  // nice, stable ordering
  rows.sort((a, b) => a.itemName.localeCompare(b.itemName));

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            {recipe.name || "Recipe"}
          </h1>
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
          {/* <Link href={`/recipes/${id}/edit`} className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">Edit</Link> */}
        </div>
      </div>

      {/* Meta cards */}
      <div className="grid md:grid-cols-3 gap-3">
        <div className="border rounded-lg p-3">
          <div className="text-xs opacity-75">YIELD</div>
          <div className="text-xl font-semibold tabular-nums">
            {fmtQty(Number(recipe.yield_qty ?? 0))}{" "}
            <span className="text-base opacity-80">
              {recipe.yield_unit ?? ""}
            </span>
          </div>
        </div>
        <div className="border rounded-lg p-3">
          <div className="text-xs opacity-75">INGREDIENT LINES</div>
          <div className="text-xl font-semibold tabular-nums">
            {rows.length}
          </div>
        </div>
        <div className="border rounded-lg p-3">
          <div className="text-xs opacity-75">EST. COST (SUM)</div>
          <div className="text-xl font-semibold">
            {fmtUSD(totals.totalCost)}
          </div>
        </div>
      </div>

      {/* Ingredients table */}
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
                <td className="p-2 text-right tabular-nums">
                  {fmtUSD(r.lineCost)}
                </td>
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
              <td className="p-2"></td>
              <td className="p-2"></td>
              <td className="p-2 text-right font-medium tabular-nums">
                {fmtUSD(totals.totalCost)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Timestamps */}
      <div className="text-xs text-neutral-500">
        <div>
          Created:{" "}
          {recipe.created_at
            ? new Date(recipe.created_at).toLocaleString()
            : "—"}
        </div>
        <div>
          Updated:{" "}
          {recipe.updated_at
            ? new Date(recipe.updated_at).toLocaleString()
            : "—"}
        </div>
        <div className="mt-2">
          Recipe ID: <code className="select-all">{recipe.id}</code>
        </div>
      </div>
    </main>
  );
}
