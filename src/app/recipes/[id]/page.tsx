// src/app/recipes/[id]/page.tsx
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import {
  buildRecipeCostIndex,
  costPerBaseUnit,
  fmtUSD,
  type IngredientLine,
  type RecipeLike,
} from "@/lib/costing";
import DeleteRecipeButton from "@/components/DeleteRecipeButton";

export const dynamic = "force-dynamic";

type IngredientRow = {
  id: string;
  recipe_id: string;
  item_id: string | null;
  sub_recipe_id: string | null;
  qty: number | null; // per serving
  unit: string | null;
};

type InvItem = {
  id: string;
  name: string;
  base_unit: string;
  last_price: number | null;
  pack_to_base_factor: number | null;
};

export default async function RecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerClient();

  // Auth → tenant
  const { data: u } = await supabase.auth.getUser();
  const userId = u.user?.id ?? null;
  if (!userId) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Recipe</h1>
        <p className="mt-4">Sign in required.</p>
        <Link href="/login?redirect=/recipes" className="underline">
          Go to login
        </Link>
      </main>
    );
  }
  const { data: prof } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", userId)
    .maybeSingle();
  const tenantId = prof?.tenant_id ?? null;
  if (!tenantId) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Recipe</h1>
        <p className="mt-4">Profile missing tenant.</p>
        <Link href="/recipes" className="underline">
          Back to recipes
        </Link>
      </main>
    );
  }

  // The specific recipe
  const { data: recipe } = await supabase
    .from("recipes")
    .select(
      "id,name,batch_yield_qty,batch_yield_unit,yield_pct,description,tenant_id"
    )
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!recipe) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Recipe</h1>
        <p className="mt-4">Recipe not found.</p>
        <Link href="/recipes" className="underline">
          Back to recipes
        </Link>
      </main>
    );
  }

  // All recipes for the tenant (for sub-recipe costing & names)
  const { data: allRecipesRaw } = await supabase
    .from("recipes")
    .select("id,name,yield_pct,batch_yield_qty,batch_yield_unit")
    .eq("tenant_id", tenantId);
  const allRecipes = (allRecipesRaw ?? []) as RecipeLike[];
  const recipeNameById = new Map<string, string>(
    allRecipes.map((r) => [r.id, r.name ?? "Untitled"])
  );

  // All recipe ingredients for the tenant (needed to compute sub-recipe costs)
  const { data: allIngsRaw } = await supabase
    .from("recipe_ingredients")
    .select("id,recipe_id,item_id,sub_recipe_id,qty,unit");
  const allIngs = (allIngsRaw ?? []) as IngredientLine[];

  // Ingredient lines for THIS recipe (for display)
  const lines = allIngs.filter((l) => l.recipe_id === recipe.id) as IngredientRow[];

  // Inventory items (names + live $/base)
  const { data: itemsRaw } = await supabase
    .from("inventory_items")
    .select("id,name,base_unit,last_price,pack_to_base_factor")
    .eq("tenant_id", tenantId);
  const items = (itemsRaw ?? []) as InvItem[];

  const itemCostById: Record<string, number> = {};
  const itemById: Record<string, InvItem> = {};
  items.forEach((it) => {
    itemById[it.id] = it;
    itemCostById[it.id] = costPerBaseUnit(
      Number(it.last_price ?? 0),
      Number(it.pack_to_base_factor ?? 0)
    );
  });

  // Cost index with sub-recipes
  const costIndex = buildRecipeCostIndex(allRecipes, allIngs, itemCostById);
  const rawCostPerPortion = costIndex[recipe.id] ?? 0;

  // Default pricing preview (matches Menu defaults)
  const defaultMargin = 0.3;
  const defaultEnding = ".99";
  const suggested = (() => {
    const price = rawCostPerPortion / defaultMargin;
    const whole = Math.floor(price);
    const cents = Number(defaultEnding.slice(1));
    const candidate = whole + cents / 100;
    return candidate < price ? candidate + 1 : candidate;
  })();

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-6">
      {/* Header & actions */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{recipe.name ?? "Untitled"}</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/recipes"
            className="text-sm underline opacity-80 hover:opacity-100"
          >
            Back to recipes
          </Link>
          <Link
            href={`/recipes/${recipe.id}/edit`}
            className="px-3 py-1.5 border rounded-md text-sm hover:bg-neutral-900"
          >
            Edit Recipe
          </Link>
          <DeleteRecipeButton recipeId={recipe.id} />
        </div>
      </div>

      {/* Top: Costing + Recipe description (right side) */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="border rounded p-4">
          <div className="font-semibold mb-2">Costing</div>
          <dl className="text-sm space-y-2">
            <div className="flex justify-between">
              <dt>Raw cost per portion</dt>
              <dd className="tabular-nums">{fmtUSD(rawCostPerPortion)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Suggested price (30% margin, .99)</dt>
              <dd className="tabular-nums">{fmtUSD(suggested)}</dd>
            </div>
          </dl>
          <p className="text-xs mt-3 opacity-70">
            Pricing logic matches <em>Menu</em>. You can fine-tune
            margin/rounding on the Menu page when you add this recipe.
          </p>
        </div>

        <div className="border rounded p-4">
          <div className="font-semibold mb-2">Recipe description</div>
          <p className="text-sm whitespace-pre-line opacity-90">
            {(recipe.description ?? "").trim() || "—"}
          </p>
        </div>
      </div>

      {/* Yield / Portions */}
      <div className="border rounded p-4">
        <div className="font-semibold mb-2">Yield & Portions</div>
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div className="flex justify-between sm:block">
            <dt className="opacity-70">Batch yield qty</dt>
            <dd className="tabular-nums">
              {Number(recipe.batch_yield_qty ?? 0) || "—"}
            </dd>
          </div>
          <div className="flex justify-between sm:block">
            <dt className="opacity-70">Batch yield unit</dt>
            <dd>{(recipe.batch_yield_unit ?? "").trim() || "—"}</dd>
          </div>
          <div className="flex justify-between sm:block">
            <dt className="opacity-70">Yield % after loss</dt>
            <dd className="tabular-nums">
              {recipe.yield_pct != null
                ? Math.round(Number(recipe.yield_pct) * 100) + "%"
                : "—"}
            </dd>
          </div>
        </dl>
      </div>

      {/* Ingredients */}
      <div className="border rounded overflow-hidden">
        <div className="p-3 font-semibold">Ingredients (per serving)</div>
        <table className="w-full text-sm">
          <thead className="bg-neutral-900/60">
            <tr>
              <th className="text-left p-2">Item / Recipe</th>
              <th className="text-right p-2">Qty</th>
              <th className="text-left p-2">Unit</th>
              <th className="text-right p-2">$/base or $/portion</th>
              <th className="text-right p-2">Line cost</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const qty = Number(line.qty ?? 0);
              if (line.sub_recipe_id) {
                const subId = String(line.sub_recipe_id);
                const subName = recipeNameById.get(subId) ?? "Recipe";
                const subCost = costIndex[subId] ?? 0;
                const lineCost = qty * subCost;
                return (
                  <tr key={line.id} className="border-t">
                    <td className="p-2">🧪 {subName}</td>
                    <td className="p-2 text-right tabular-nums">{qty.toFixed(4)}</td>
                    <td className="p-2">portion</td>
                    <td className="p-2 text-right tabular-nums">{fmtUSD(subCost)}</td>
                    <td className="p-2 text-right tabular-nums">{fmtUSD(lineCost)}</td>
                  </tr>
                );
              } else {
                const it = line.item_id ? itemById[String(line.item_id)] : undefined;
                const unitCost = line.item_id ? (itemCostById[String(line.item_id)] ?? 0) : 0;
                const baseUnit = line.unit || it?.base_unit || "—";
                const lineCost = qty * unitCost;
                return (
                  <tr key={line.id} className="border-t">
                    <td className="p-2">{it?.name ?? "—"}</td>
                    <td className="p-2 text-right tabular-nums">{qty.toFixed(4)}</td>
                    <td className="p-2">{baseUnit}</td>
                    <td className="p-2 text-right tabular-nums">{unitCost ? fmtUSD(unitCost) : "—"}</td>
                    <td className="p-2 text-right tabular-nums">{fmtUSD(lineCost)}</td>
                  </tr>
                );
              }
            })}
            {lines.length === 0 && (
              <tr>
                <td colSpan={5} className="p-3 text-neutral-400">
                  No ingredients yet.
                </td>
              </tr>
            )}
          </tbody>
          {lines.length > 0 && (
            <tfoot>
              <tr className="border-t bg-neutral-900/20">
                <td className="p-2 font-medium text-right" colSpan={4}>
                  Raw cost per portion
                </td>
                <td className="p-2 text-right tabular-nums font-medium">
                  {fmtUSD(rawCostPerPortion)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </main>
  );
}
