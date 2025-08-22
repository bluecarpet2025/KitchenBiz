// src/app/recipes/[id]/page.tsx
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { costPerBaseUnit, costPerPortion, priceFromCost, fmtUSD } from "@/lib/costing";

export const dynamic = "force-dynamic";

type RecipeRow = {
  id: string;
  name: string | null;
  batch_yield_qty: number | null;
  batch_yield_unit: string | null;
  yield_pct: number | null;
  menu_description: string | null;
};
type IngredientRow = {
  recipe_id: string;
  item_id: string;
  qty: number | null;
};

export default async function RecipePage({
  params,
  searchParams,
}: {
  // Next.js 15 passes params/searchParams as Promises
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[]>>;
}) {
  const { id } = await params;

  const supabase = await createServerClient();
  const { data: u } = await supabase.auth.getUser();
  const userId = u.user?.id ?? null;

  if (!userId) {
    return (
      <main className="max-w-4xl mx-auto p-6">
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
      <main className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Recipe</h1>
        <p className="mt-4">Profile missing tenant.</p>
        <Link href="/recipes" className="underline">
          Back to recipes
        </Link>
      </main>
    );
  }

  // Pull the recipe
  const { data: recipe } = await supabase
    .from("recipes")
    .select("id,name,batch_yield_qty,batch_yield_unit,yield_pct,menu_description,tenant_id")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!recipe) {
    return (
      <main className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Recipe</h1>
        <p className="mt-4">Recipe not found.</p>
        <Link href="/recipes" className="underline">
          Back to recipes
        </Link>
      </main>
    );
  }

  // Ingredients for this recipe
  const { data: ingRaw } = await supabase
    .from("recipe_ingredients")
    .select("recipe_id,item_id,qty")
    .eq("recipe_id", recipe.id);
  const ingredients = (ingRaw ?? []) as IngredientRow[];

  // Item costs
  const { data: itemsRaw } = await supabase
    .from("inventory_items")
    .select("id,last_price,pack_to_base_factor")
    .eq("tenant_id", tenantId);

  // 🔧 IMPORTANT: itemCostById (not itemsById)
  const itemCostById: Record<string, number> = {};
  (itemsRaw ?? []).forEach((it: any) => {
    itemCostById[it.id] = costPerBaseUnit(
      Number(it.last_price ?? 0),
      Number(it.pack_to_base_factor ?? 0)
    );
  });

  // Costs
  const rawCostPerPortion = costPerPortion(recipe, ingredients, itemCostById);
  const margin = 0.3; // default 30% suggested margin here
  const suggested = priceFromCost(rawCostPerPortion, margin);

  return (
    <main className="max-w-4xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{recipe.name ?? "Untitled"}</h1>
        <Link href="/recipes" className="text-sm underline">
          Back to recipes
        </Link>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="border rounded p-4">
          <div className="font-semibold mb-2">Costing</div>
          <dl className="text-sm space-y-2">
            <div className="flex justify-between">
              <dt>Raw cost per portion</dt>
              <dd className="tabular-nums">{fmtUSD(rawCostPerPortion)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Suggested price (30% margin)</dt>
              <dd className="tabular-nums">{fmtUSD(suggested)}</dd>
            </div>
          </dl>
        </div>

        <div className="border rounded p-4">
          <div className="font-semibold mb-2">Menu description</div>
          <p className="text-sm whitespace-pre-line opacity-90">
            {(recipe.menu_description ?? "").trim() || "—"}
          </p>
        </div>
      </div>
    </main>
  );
}
