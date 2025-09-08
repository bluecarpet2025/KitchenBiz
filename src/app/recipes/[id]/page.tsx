// /src/app/recipes/[id]/page.tsx
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { getEffectiveTenant } from "@/lib/effective-tenant";
import { fmtQty } from "@/lib/format";

export const dynamic = "force-dynamic";

type Recipe = {
  id: string;
  tenant_id: string;
  name: string | null;
  description: string | null;
  batch_yield_qty: number | null;
  batch_yield_unit: string | null;
  yield_pct: number | null; // may be 1 for 100%, or 85 for 85%, etc.
  created_at: string | null;
};

type IngRow = {
  id: string;
  item_id: string | null;
  sub_recipe_id: string | null;
  qty: number | null;
  unit: string | null;
};

type Item = { id: string; name: string; base_unit: string | null };
type SubRecipe = { id: string; name: string; batch_yield_unit: string | null };

// Normalize yield to a fraction between 0..1
function normYieldFraction(y?: number | null): number {
  if (!y || y <= 0) return 1;        // default 100%
  return y > 1.5 ? y / 100 : y;      // handle 1==100%, or 85==85%
}

export default async function RecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createServerClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Recipe</h1>
        <p className="mt-4">Sign in required.</p>
        <Link className="underline" href={`/login?redirect=/recipes/${id}`}>
          Go to login
        </Link>
      </main>
    );
  }

  // respect demo/real tenant
  const tenantId = await getEffectiveTenant(supabase);
  if (!tenantId) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Recipe</h1>
        <p className="mt-4">Profile missing tenant.</p>
      </main>
    );
  }

  // Load the recipe
  const { data: recipe, error: rErr } = await supabase
    .from("recipes")
    .select(
      "id, tenant_id, name, description, batch_yield_qty, batch_yield_unit, yield_pct, created_at"
    )
    .eq("id", id)
    .maybeSingle();
  if (rErr || !recipe) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Recipe not found</h1>
        <Link href="/recipes" className="underline mt-2 inline-block">
          Back to recipes
        </Link>
      </main>
    );
  }

  // Ingredients for this recipe
  const { data: rows } = await supabase
    .from("recipe_ingredients")
    .select("id,item_id,sub_recipe_id,qty,unit")
    .eq("recipe_id", id)
    .order("id");
  const ings = (rows ?? []) as IngRow[];

  // Pull names/units for items and sub-recipes used
  const itemIds = ings.filter((r) => r.item_id).map((r) => r.item_id!) as string[];
  const subIds = ings.filter((r) => r.sub_recipe_id).map((r) => r.sub_recipe_id!) as string[];

  let items: Item[] = [];
  if (itemIds.length) {
    const { data } = await supabase
      .from("inventory_items")
      .select("id,name,base_unit")
      .in("id", itemIds);
    items = (data ?? []) as Item[];
  }
  let subs: SubRecipe[] = [];
  if (subIds.length) {
    const { data } = await supabase
      .from("recipes")
      .select("id,name,batch_yield_unit")
      .in("id", subIds);
    subs = (data ?? []) as SubRecipe[];
  }
  const itemMap = new Map(items.map((i) => [i.id, i]));
  const subMap = new Map(subs.map((s) => [s.id, s]));

  // Makeable (batches) for this recipe (use simple view; fall back to 0 if missing)
  let makeable = 0;
  try {
    const { data: mk } = await supabase
      .from("v_recipe_makeable_simple")
      .select("makeable")
      .eq("tenant_id", tenantId)
      .eq("recipe_id", recipe.id)
      .maybeSingle();
    makeable = Number(mk?.makeable ?? 0);
  } catch {
    makeable = 0;
  }

  const yieldFrac = normYieldFraction(recipe.yield_pct);
  const yieldDisplay = Math.round(yieldFrac * 100).toLocaleString();

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{recipe.name ?? "Untitled recipe"}</h1>
        <div className="flex gap-2">
          <Link
            href="/recipes"
            className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
          >
            Back to recipes
          </Link>
          <Link
            href={`/recipes/${recipe.id}/edit`}
            className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
          >
            Edit
          </Link>
        </div>
      </div>

      {/* Header cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="border rounded p-4">
          <div className="text-sm opacity-70">Batch yield</div>
          <div className="text-xl font-semibold">
            {fmtQty(recipe.batch_yield_qty ?? 0)}{" "}
            <span className="text-base">{recipe.batch_yield_unit ?? ""}</span>
          </div>
        </div>
        <div className="border rounded p-4">
          <div className="text-sm opacity-70">Yield %</div>
          <div className="text-xl font-semibold">{yieldDisplay}%</div>
        </div>
        <div className="border rounded p-4">
          <div className="text-sm opacity-70">Makeable (batches)</div>
          <div className="text-xl font-semibold">
            {Number(makeable).toLocaleString()}
          </div>
        </div>
      </div>

      {recipe.description ? (
        <div className="border rounded p-4">{recipe.description}</div>
      ) : null}

      {/* Ingredients table */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm table-auto">
          <thead>
            <tr className="text-left text-neutral-300">
              <th className="p-2">Ingredient</th>
              <th className="p-2 text-right">Qty</th>
              <th className="p-2">Unit</th>
              <th className="p-2 text-right">Base qty</th>
              <th className="p-2">Base unit</th>
            </tr>
          </thead>
          <tbody>
            {ings.map((r) => {
              const isItem = !!r.item_id;
              const it = r.item_id ? itemMap.get(r.item_id) : null;
              const sub = r.sub_recipe_id ? subMap.get(r.sub_recipe_id) : null;

              const name =
                isItem ? (it?.name ?? "—") : (sub?.name ?? "— (sub-recipe)");
              const baseUnit = isItem
                ? (it?.base_unit ?? r.unit ?? "")
                : (sub?.batch_yield_unit ?? r.unit ?? "");
              // We’re not converting units here; “Base qty” shows the quantity in the base unit context
              const baseQty = Number(r.qty ?? 0);

              return (
                <tr key={r.id} className="border-t">
                  <td className="p-2">{name}</td>
                  <td className="p-2 text-right tabular-nums">
                    {fmtQty(Number(r.qty ?? 0))}
                  </td>
                  <td className="p-2">{r.unit ?? ""}</td>
                  <td className="p-2 text-right tabular-nums">
                    {fmtQty(baseQty)}
                  </td>
                  <td className="p-2">{baseUnit}</td>
                </tr>
              );
            })}
            {ings.length === 0 && (
              <tr>
                <td className="p-3 text-neutral-400" colSpan={5}>
                  No ingredients yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
