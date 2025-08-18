// src/app/recipes/page.tsx
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Recipe = { id: string; name: string | null; created_at: string | null };

export default async function RecipesPage() {
  const supabase = await createServerClient(); // <-- await helper (Next 15)
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return (
      <main className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Recipes</h1>
        <p className="mt-4">Sign in required.</p>
        <Link href="/login?redirect=/recipes" className="underline">Go to login</Link>
      </main>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .single();
  const tenantId = profile?.tenant_id ?? null;

  const { data: recipes } = await supabase
    .from("recipes")
    .select("id, name, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .returns<Recipe[]>();

  if (!recipes || recipes.length === 0) {
    return (
      <main className="max-w-6xl mx-auto p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Recipes</h1>
          <Link href="/recipes/new" className="px-3 py-2 border rounded-md text-sm hover:bg-muted">
            New Recipe
          </Link>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">No recipes yet.</p>
      </main>
    );
  }

  // Load ingredients for all recipes
  const { data: recipeIngs } = await supabase
    .from("recipe_ingredients")
    .select("recipe_id, inventory_item_id, qty_per_recipe")
    .in("recipe_id", recipes.map((r) => r.id));

  // Load on-hand quantities
  const { data: onhand } = await supabase
    .from("v_inventory_on_hand")
    .select("item_id, qty_on_hand")
    .eq("tenant_id", tenantId);

  const onMap = new Map(
    (onhand ?? []).map((r: any) => [r.item_id, Number(r.qty_on_hand || 0)])
  );
  const byRecipe = new Map<string, { min: number }>();

  for (const r of recipes) {
    const lines = (recipeIngs ?? []).filter((x) => x.recipe_id === r.id);
    if (lines.length === 0) {
      byRecipe.set(r.id, { min: 0 });
      continue;
    }
    let minMakeable = Infinity;
    for (const ln of lines) {
      const have = onMap.get(ln.inventory_item_id) ?? 0;
      const need = Number(ln.qty_per_recipe) || 0;
      if (need <= 0) continue;
      const can = Math.floor(have / need);
      if (can < minMakeable) minMakeable = can;
    }
    if (!Number.isFinite(minMakeable)) minMakeable = 0;
    byRecipe.set(r.id, { min: Math.max(0, minMakeable) });
  }

  return (
    <main className="max-w-6xl mx-auto p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Recipes</h1>
        <Link href="/recipes/new" className="px-3 py-2 border rounded-md text-sm hover:bg-muted">
          New Recipe
        </Link>
      </div>

      <div className="border rounded-lg overflow-hidden mt-4">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-2">Recipe</th>
              <th className="text-right p-2">Makeable</th>
              <th className="text-left p-2">Created</th>
              <th className="text-right p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {recipes.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-2">{r.name ?? "Untitled"}</td>
                <td className="p-2 text-right tabular-nums">
                  {byRecipe.get(r.id)?.min ?? 0}
                </td>
                <td className="p-2">
                  {r.created_at ? new Date(r.created_at).toLocaleDateString() : "-"}
                </td>
                <td className="p-2 text-right">
                  <div className="inline-flex gap-2">
                    <Link href={`/recipes/${r.id}`} className="underline">Open</Link>
                    <Link href={`/recipes/${r.id}/duplicate`} className="underline">Duplicate</Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
