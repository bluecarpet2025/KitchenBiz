// src/app/recipes/[id]/page.tsx
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { fmtQty } from "@/lib/format";

export const dynamic = "force-dynamic";

type RecipeRow = {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  batch_yield_qty: number | null;
  batch_yield_unit: string | null;
  yield_pct: number | null;
};

type IngredientRow = {
  id: string;
  recipe_id: string;
  item_id: string | null;
  sub_recipe_id: string | null;
  qty: number;
  unit: string;
  // joined fields (if item)
  item_name?: string | null;
  base_unit?: string | null;
  purchase_unit?: string | null;
  pack_to_base_factor?: number | null;
};

type MakeableRow = { recipe_id: string; makeable: number | null };

async function getTenant() {
  const supabase = await createServerClient();
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id ?? null;
  if (!uid) return { supabase, tenantId: null };

  const { data: prof } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", uid)
    .maybeSingle();

  return { supabase, tenantId: prof?.tenant_id ?? null };
}

function toBaseQty(ing: IngredientRow): { baseQty: number | null; baseUnit: string | null } {
  if (!ing.item_id) return { baseQty: null, baseUnit: null }; // sub-recipes not converted here
  const unit = ing.unit?.trim()?.toLowerCase();
  const bu = ing.base_unit?.trim()?.toLowerCase() || null;
  const pu = ing.purchase_unit?.trim()?.toLowerCase() || null;
  const factor = Number(ing.pack_to_base_factor ?? 0);

  if (bu && (unit === bu || unit == null)) {
    return { baseQty: Number(ing.qty), baseUnit: ing.base_unit ?? null };
  }
  if (pu && unit === pu && factor > 0) {
    return { baseQty: Number(ing.qty) * factor, baseUnit: ing.base_unit ?? null };
  }
  // Fallback: unknown conversion, show the original qty and the item base unit to avoid lying
  return { baseQty: Number(ing.qty), baseUnit: ing.base_unit ?? null };
}

export default async function RecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, tenantId } = await getTenant();

  if (!tenantId) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Recipe</h1>
        <p className="mt-4">Sign in required or profile missing tenant.</p>
        <Link className="underline" href="/login?redirect=/recipes">Go to login</Link>
      </main>
    );
  }

  // Load recipe
  const { data: recipe } = await supabase
    .from("recipes")
    .select("id,tenant_id,name,description,batch_yield_qty,batch_yield_unit,yield_pct,deleted_at")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();

  if (!recipe || (recipe as any).deleted_at) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Recipe not found</h1>
        <p className="mt-4">The recipe doesn’t exist or was removed.</p>
        <Link className="underline" href="/recipes">Back to recipes</Link>
      </main>
    );
  }

  const r = recipe as RecipeRow;

  // Ingredients (join item info; sub-recipe lines will have item_id = null)
  const { data: ings } = await supabase
    .from("recipe_ingredients")
    .select(
      [
        "id",
        "recipe_id",
        "item_id",
        "sub_recipe_id",
        "qty",
        "unit",
        "inventory_items!inner(id, name, base_unit, purchase_unit, pack_to_base_factor)"
      ].join(",")
    )
    .eq("recipe_id", r.id);

  const rows: IngredientRow[] = (ings ?? []).map((row: any) => {
    if (row.inventory_items?.id) {
      return {
        id: row.id,
        recipe_id: row.recipe_id,
        item_id: row.item_id,
        sub_recipe_id: row.sub_recipe_id,
        qty: Number(row.qty ?? 0),
        unit: row.unit ?? "",
        item_name: row.inventory_items.name ?? null,
        base_unit: row.inventory_items.base_unit ?? null,
        purchase_unit: row.inventory_items.purchase_unit ?? null,
        pack_to_base_factor: row.inventory_items.pack_to_base_factor ?? null,
      };
    }
    // sub-recipe line (no item join)
    return {
      id: row.id,
      recipe_id: row.recipe_id,
      item_id: row.item_id,
      sub_recipe_id: row.sub_recipe_id,
      qty: Number(row.qty ?? 0),
      unit: row.unit ?? "",
      item_name: null,
      base_unit: null,
      purchase_unit: null,
      pack_to_base_factor: null,
    };
  });

  // Makeable value (batches) from the view
  const { data: mkRow } = await supabase
    .from("v_recipe_makeable_simple")
    .select("recipe_id, makeable")
    .eq("tenant_id", tenantId)
    .eq("recipe_id", r.id)
    .maybeSingle();

  const makeable = Number((mkRow as MakeableRow | null)?.makeable ?? 0);

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{r.name}</h1>
        <div className="flex gap-2">
          <Link
            href="/recipes"
            className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
          >
            Back to recipes
          </Link>
          <Link
            href={`/recipes/${r.id}/edit`}
            className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
          >
            Edit
          </Link>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <div className="border rounded p-3">
          <div className="text-sm opacity-70">Batch yield</div>
          <div className="text-xl font-semibold">
            {fmtQty(r.batch_yield_qty ?? 1)}{" "}
            <span className="text-base opacity-80">{r.batch_yield_unit ?? "each"}</span>
          </div>
        </div>
        <div className="border rounded p-3">
          <div className="text-sm opacity-70">Yield %</div>
          <div className="text-xl font-semibold">
            {r.yield_pct == null ? "100%" : `${Math.round(Number(r.yield_pct))}%`}
          </div>
        </div>
        <div className="border rounded p-3">
          <div className="text-sm opacity-70">Makeable (batches)</div>
          <div className="text-xl font-semibold tabular-nums">
            {makeable.toLocaleString()}
          </div>
        </div>
      </div>

      {r.description ? (
        <p className="text-sm opacity-80 border rounded p-3">{r.description}</p>
      ) : null}

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm table-auto">
          <thead className="bg-neutral-900/60">
            <tr className="text-left text-neutral-300">
              <th className="p-2">Ingredient</th>
              <th className="p-2 text-right">Qty</th>
              <th className="p-2">Unit</th>
              <th className="p-2 text-right">Base qty</th>
              <th className="p-2">Base unit</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((ing) => {
              // Label for ingredient
              const label =
                ing.item_id && ing.item_name
                  ? ing.item_name
                  : ing.sub_recipe_id
                  ? "Sub-recipe"
                  : "Ingredient";

              const { baseQty, baseUnit } = toBaseQty(ing);

              return (
                <tr key={ing.id} className="border-t">
                  <td className="p-2">{label}</td>
                  <td className="p-2 text-right tabular-nums">{fmtQty(ing.qty)}</td>
                  <td className="p-2">{ing.unit || "—"}</td>
                  <td className="p-2 text-right tabular-nums">
                    {baseQty == null ? "—" : fmtQty(baseQty)}
                  </td>
                  <td className="p-2">{baseUnit ?? "—"}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
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
