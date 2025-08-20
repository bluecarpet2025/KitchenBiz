import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import ArchiveRecipeButton from "@/components/ArchiveRecipeButton";

export const dynamic = "force-dynamic";

type RecipeRow = {
  id: string;
  name: string | null;
  created_at: string | null;
  batch_yield_qty: number | null;
  batch_yield_unit: string | null;
  yield_pct: number | null;
};
type IngredientRow = { recipe_id: string; item_id: string; qty: number | null };
type OnHandRow = { item_id: string; qty_on_hand_base: number };

async function getTenant(supabase: Awaited<ReturnType<typeof createServerClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, tenantId: null };
  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .single();
  return { user, tenantId: profile?.tenant_id ?? null };
}

export default async function RecipesPage() {
  const supabase = await createServerClient();
  const { user, tenantId } = await getTenant(supabase);

  if (!user || !tenantId) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Recipes</h1>
        <p className="mt-4">Sign in required.</p>
        <Link href="/login?redirect=/recipes" className="underline">Go to login</Link>
      </main>
    );
  }

  const { data: recipesRaw } = await supabase
    .from("recipes")
    .select("id,name,created_at,batch_yield_qty,batch_yield_unit,yield_pct,deleted_at")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .order("name");
  const recipes = (recipesRaw ?? []) as RecipeRow[];

  const recipeIds = recipes.map(r => r.id);
  let ingredients: IngredientRow[] = [];
  if (recipeIds.length) {
    const { data: ingRaw } = await supabase
      .from("recipe_ingredients")
      .select("recipe_id,item_id,qty")
      .in("recipe_id", recipeIds);
    ingredients = (ingRaw ?? []) as IngredientRow[];
  }

  const { data: ohRaw } = await supabase
    .from("v_inventory_on_hand")
    .select("item_id,qty_on_hand_base")
    .eq("tenant_id", tenantId);
  const onhandMap = new Map<string, number>();
  (ohRaw ?? []).forEach((r: OnHandRow) => {
    onhandMap.set(r.item_id, Number(r.qty_on_hand_base ?? 0));
  });

  const ingByRecipe = new Map<string, IngredientRow[]>();
  for (const row of ingredients) {
    if (!ingByRecipe.has(row.recipe_id)) ingByRecipe.set(row.recipe_id, []);
    ingByRecipe.get(row.recipe_id)!.push(row);
  }

  const rows = recipes.map((rec) => {
    const parts = ingByRecipe.get(rec.id) ?? [];
    const yieldPct = Number(rec.yield_pct ?? 1);
    const batchQty = Number(rec.batch_yield_qty ?? 1);
    let makeable: number | null = null;
    for (const p of parts) {
      const perServing = batchQty > 0
        ? Number(p.qty ?? 0) * (yieldPct || 1) / batchQty
        : Number(p.qty ?? 0);
      if (!perServing || perServing <= 0) continue;
      const onHand = onhandMap.get(p.item_id) ?? 0;
      const possible = Math.floor(onHand / perServing);
      makeable = makeable === null ? possible : Math.min(makeable, possible);
    }
    if (makeable === null) makeable = 0;
    return {
      id: rec.id,
      name: rec.name ?? "Untitled",
      created_at: rec.created_at,
      makeable,
    };
  });

  return (
    <main className="max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Recipes</h1>
        <Link href="/recipes/new" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
          New Recipe
        </Link>
      </div>

      <div className="mt-4 border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900/60">
            <tr>
              <th className="text-left p-2">Recipe</th>
              <th className="text-right p-2">Makeable</th>
              <th className="text-left p-2">Created</th>
              <th className="text-left p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-t">
                <td className="p-2">
                  <Link href={`/recipes/${r.id}`} className="underline">
                    {r.name}
                  </Link>
                </td>
                <td className="p-2 text-right tabular-nums">{r.makeable}</td>
                <td className="p-2">{r.created_at ? new Date(r.created_at).toLocaleDateString() : "-"}</td>
                <td className="p-2 space-x-3">
                  <Link href={`/recipes/${r.id}?dup=1`} className="underline">Duplicate</Link>
                  <ArchiveRecipeButton recipeId={r.id} onArchived={() => location.reload()} />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="p-3 text-neutral-400">No recipes yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs mt-3 opacity-70">
        <strong>Makeable</strong> uses your current inventory (base units) and recipe yields to estimate how many portions you can prep now.
      </p>
    </main>
  );
}
