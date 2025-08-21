// src/app/recipes/[id]/page.tsx
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import RecipePriceBox from "@/components/RecipePriceBox";
import {
  costPerBaseUnit,
  costPerServing,
  fmtUSD,
  type IngredientLine,
  type RecipeLike,
} from "@/lib/costing";

export const dynamic = "force-dynamic";

type RecipeRow = RecipeLike & {
  id: string;
  name: string | null;
  created_at: string | null;
  batch_yield_unit: string | null;
};

type IngredientRow = IngredientLine & {
  // qty is the amount in the item's *base* unit for the whole batch
  unit: string | null; // kept for display, but not used by math
};

type ItemRow = {
  id: string;
  name: string | null;
  base_unit: string | null;
  last_price: number | null; // pack/case price
  pack_to_base_factor: number | null; // e.g., case -> grams
};

function fmtDate(d?: string | null) {
  if (!d) return "-";
  try {
    return new Date(d).toLocaleDateString();
  } catch {
    return "-";
  }
}

export default async function RecipeDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createServerClient();

  // auth -> tenant
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  if (!uid) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Recipe</h1>
        <p className="mt-4">Sign in required.</p>
        <Link className="underline" href="/login?redirect=/recipes">
          Go to login
        </Link>
      </main>
    );
  }
  const { data: prof } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", uid)
    .maybeSingle();
  const tenantId = prof?.tenant_id ?? null;

  // recipe
  const { data: recipe } = await supabase
    .from("recipes")
    .select(
      "id,name,created_at,batch_yield_qty,batch_yield_unit,yield_pct,tenant_id"
    )
    .eq("id", params.id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!recipe) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Recipe</h1>
        <p className="mt-4">Recipe not found.</p>
        <Link className="underline" href="/recipes">
          Back to recipes
        </Link>
      </main>
    );
  }

  // ingredients
  const { data: ing } = await supabase
    .from("recipe_ingredients")
    .select("item_id,qty,unit")
    .eq("recipe_id", recipe.id);
  const ingredients = (ing ?? []) as IngredientRow[];

  const itemIds = ingredients.map((r) => r.item_id);
  let items: ItemRow[] = [];
  if (itemIds.length) {
    const { data: it } = await supabase
      .from("inventory_items")
      .select("id,name,base_unit,last_price,pack_to_base_factor")
      .in("id", itemIds)
      .eq("tenant_id", tenantId);
    items = (it ?? []) as ItemRow[];
  }

  // $/base unit lookup for cost calculator
  const itemCostById: Record<string, number> = Object.fromEntries(
    items.map((i) => [
      i.id,
      costPerBaseUnit(i.last_price, i.pack_to_base_factor),
    ])
  );

  const cps = costPerServing({
    recipe,
    ingredients,
    itemCostById,
  });

  // build a convenience map to show item names & unit costs in the table
  const itemById = new Map<string, ItemRow>();
  items.forEach((it) => itemById.set(it.id, it));

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            {recipe.name ?? "Untitled recipe"}
          </h1>
          <p className="text-sm opacity-70">
            Created {fmtDate(recipe.created_at)}
          </p>
        </div>
        <Link href="/recipes" className="text-sm underline">
          ← Back to recipes
        </Link>
      </div>

      {/* Pricing summary */}
      <RecipePriceBox baseCostPerServing={cps} defaultMarginPct={30} />

      {/* Batch yield */}
      <div className="border rounded-lg p-4">
        <div className="text-sm">
          <span className="opacity-70">Batch yield:&nbsp;</span>
          <span className="tabular-nums">
            {recipe.batch_yield_qty ?? 1} {recipe.batch_yield_unit ?? ""}
          </span>
          &nbsp; · &nbsp;
          <span className="opacity-70">Yield %:&nbsp;</span>
          <span className="tabular-nums">
            {recipe.yield_pct == null
              ? "100%"
              : `${Math.round((recipe.yield_pct || 0) * 100)}%`}
          </span>
        </div>
      </div>

      {/* Ingredients & unit costs */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900/60">
            <tr>
              <th className="text-left p-2">Item</th>
              <th className="text-right p-2">Qty (batch)</th>
              <th className="text-right p-2">$ / base unit</th>
              <th className="text-right p-2">Cost / serving</th>
            </tr>
          </thead>
          <tbody>
            {ingredients.map((r, i) => {
              const it = itemById.get(r.item_id);
              const unitCost = itemCostById[r.item_id] ?? 0;

              // per-serving qty = batch qty / (batch_yield_qty * yield_pct)
              const batchQty = Number(recipe.batch_yield_qty ?? 1);
              const yieldPct =
                recipe.yield_pct == null ? 1 : Number(recipe.yield_pct || 1);
              const effectiveBatch = Math.max(1e-9, batchQty * yieldPct);

              const perServingQty = Number(r.qty ?? 0) / effectiveBatch;
              const perServingCost = perServingQty * unitCost;

              return (
                <tr className="border-t" key={i}>
                  <td className="p-2">
                    {it?.name ?? "(missing)"}{" "}
                    {it?.base_unit ? (
                      <span className="opacity-60 text-xs">
                        ({it.base_unit})
                      </span>
                    ) : null}
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {Number(r.qty ?? 0).toLocaleString()}
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {fmtUSD(unitCost)}
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {fmtUSD(perServingCost)}
                  </td>
                </tr>
              );
            })}
            {ingredients.length === 0 && (
              <tr>
                <td colSpan={4} className="p-3 text-neutral-400">
                  No ingredients yet.
                </td>
              </tr>
            )}
            {ingredients.length > 0 && (
              <tr className="border-t bg-neutral-900/40">
                <td className="p-2 font-medium">Total</td>
                <td className="p-2" />
                <td className="p-2" />
                <td className="p-2 text-right font-semibold tabular-nums">
                  {fmtUSD(cps)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
