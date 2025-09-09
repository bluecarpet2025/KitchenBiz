// src/app/recipes/[id]/page.tsx
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { getEffectiveTenant } from "@/lib/effective-tenant";
import { fmtQty } from "@/lib/format";

export const dynamic = "force-dynamic";

type RecipeRow = {
  id: string;
  tenant_id: string;
  name: string | null;
  description: string | null;
  batch_yield_qty: number | null;
  batch_yield_unit: string | null;
  yield_pct: number | null;
  created_at: string | null;
};

type IngredientRow = {
  id: string;
  recipe_id: string;
  item_id: string | null;
  sub_recipe_id: string | null;
  qty: number | null;
  unit: string | null;
};

type ItemInfo = {
  id: string;
  name: string | null;
  base_unit: string | null;
};

type SubRecipeInfo = {
  id: string;
  name: string | null;
  batch_yield_unit: string | null;
};

// --- helpers ---------------------------------------------------------------

/** Normalize yield to a 0..1 fraction. Accepts 0..1 or 0..100 input. */
function normYieldFraction(y?: number | null): number {
  if (!y || y <= 0) return 1;          // default 100%
  return y > 1.5 ? y / 100 : y;
}

/** For display, return a 0..100 number (without a % sign). */
function asPercent(y?: number | null): number {
  const f = normYieldFraction(y);
  return Math.round(f * 100);
}

// --- page ------------------------------------------------------------------

export default async function RecipeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createServerClient();

  // Require tenant (respects demo tenant flag)
  const tenantId = await getEffectiveTenant(supabase);

  // Load recipe
  const { data: recipeRows, error: rErr } = await supabase
    .from("recipes")
    .select(
      "id,tenant_id,name,description,batch_yield_qty,batch_yield_unit,yield_pct,created_at"
    )
    .eq("id", id)
    .maybeSingle();

  if (rErr || !recipeRows) {
    return (
      <main className="max-w-5xl mx-auto p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Recipe</h1>
          <Link
            href="/recipes"
            className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
          >
            Back to recipes
          </Link>
        </div>
        <p className="text-red-400">
          Couldn’t load recipe (id {id}). {rErr?.message ?? "Not found."}
        </p>
      </main>
    );
  }

  const recipe: RecipeRow = recipeRows as unknown as RecipeRow;

  // Load ingredients for this recipe
  const { data: ingRaw, error: iErr } = await supabase
    .from("recipe_ingredients")
    .select("id,recipe_id,item_id,sub_recipe_id,qty,unit")
    .eq("recipe_id", id);

  if (iErr) {
    return (
      <main className="max-w-5xl mx-auto p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Recipe</h1>
          <Link
            href="/recipes"
            className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
          >
            Back to recipes
          </Link>
        </div>
        <p className="text-red-400">
          Couldn’t load ingredients. {iErr.message}
        </p>
      </main>
    );
  }

  const lines: IngredientRow[] = (ingRaw ?? []) as IngredientRow[];

  // Collect lookups we’ll need for names/units
  const itemIds = Array.from(
    new Set(lines.map((l) => l.item_id).filter(Boolean))
  ) as string[];
  const subIds = Array.from(
    new Set(lines.map((l) => l.sub_recipe_id).filter(Boolean))
  ) as string[];

  // Items lookup
  const itemsById = new Map<string, ItemInfo>();
  if (itemIds.length) {
    const { data: items } = await supabase
      .from("inventory_items")
      .select("id,name,base_unit")
      .in("id", itemIds);
    (items ?? []).forEach((it: any) =>
      itemsById.set(it.id, {
        id: it.id,
        name: it.name,
        base_unit: it.base_unit,
      })
    );
  }

  // Sub-recipes lookup
  const subsById = new Map<string, SubRecipeInfo>();
  if (subIds.length) {
    const { data: subs } = await supabase
      .from("recipes")
      .select("id,name,batch_yield_unit")
      .in("id", subIds);
    (subs ?? []).forEach((sr: any) =>
      subsById.set(sr.id, {
        id: sr.id,
        name: sr.name,
        batch_yield_unit: sr.batch_yield_unit,
      })
    );
  }

  // Makeable (batches) — prefer the DB view, fall back to 0
  let makeableBatches = 0;
  if (tenantId) {
    try {
      const { data: mk } = await supabase
        .from("v_recipe_makeable_simple")
        .select("makeable")
        .eq("tenant_id", tenantId)
        .eq("recipe_id", id)
        .maybeSingle();
      if (mk && typeof mk.makeable === "number") {
        makeableBatches = mk.makeable;
      }
    } catch {
      // ignore and leave 0
    }
  }

  // Build rows for display. For now, “Base qty / Base unit” mirrors the
  // item/sub base unit (no conversion math required yet).
  const rows = lines.map((l) => {
    if (l.item_id) {
      const item = itemsById.get(l.item_id);
      return {
        name: item?.name ?? "(item)",
        qty: Number(l.qty ?? 0),
        unit: l.unit ?? "",
        baseQty: Number(l.qty ?? 0),
        baseUnit: item?.base_unit ?? (l.unit ?? ""),
      };
    } else if (l.sub_recipe_id) {
      const sub = subsById.get(l.sub_recipe_id);
      const baseUnit = sub?.batch_yield_unit ?? l.unit ?? "";
      return {
        name: sub?.name ?? "(sub-recipe)",
        qty: Number(l.qty ?? 0),
        unit: l.unit ?? "",
        baseQty: Number(l.qty ?? 0),
        baseUnit,
      };
    }
    // Fallback (shouldn’t happen)
    return {
      name: "(ingredient)",
      qty: Number(l.qty ?? 0),
      unit: l.unit ?? "",
      baseQty: Number(l.qty ?? 0),
      baseUnit: l.unit ?? "",
    };
  });

  // Stable sort by ingredient name
  rows.sort((a, b) => a.name.localeCompare(b.name));

  const displayYield = asPercent(recipe.yield_pct);

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          {recipe.name ?? "Untitled"}
        </h1>
        <div className="flex items-center gap-2">
          <Link
            href="/recipes"
            className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
          >
            Back to recipes
          </Link>
          <Link
            href={`/recipes/${id}/edit`}
            className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
          >
            Edit
          </Link>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <div className="border rounded-lg p-3">
          <div className="text-xs opacity-75">Batch yield</div>
          <div className="text-xl font-semibold">
            {fmtQty(recipe.batch_yield_qty ?? 1)}{" "}
            {recipe.batch_yield_unit ?? ""}
          </div>
        </div>
        <div className="border rounded-lg p-3">
          <div className="text-xs opacity-75">Yield %</div>
          <div className="text-xl font-semibold">{displayYield}%</div>
        </div>
        <div className="border rounded-lg p-3">
          <div className="text-xs opacity-75">Makeable (batches)</div>
          <div className="text-xl font-semibold tabular-nums">
            {fmtQty(makeableBatches)}
          </div>
        </div>
      </div>

      {recipe.description && (
        <div className="border rounded-md p-3 text-sm">
          {recipe.description}
        </div>
      )}

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900/60">
            <tr>
              <th className="p-2 text-left">Ingredient</th>
              <th className="p-2 text-right">Qty</th>
              <th className="p-2 text-left">Unit</th>
              <th className="p-2 text-right">Base qty</th>
              <th className="p-2 text-left">Base unit</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.name}-${i}`} className="border-t">
                <td className="p-2">{r.name}</td>
                <td className="p-2 text-right tabular-nums">
                  {fmtQty(r.qty)}
                </td>
                <td className="p-2">{r.unit}</td>
                <td className="p-2 text-right tabular-nums">
                  {fmtQty(r.baseQty)}
                </td>
                <td className="p-2">{r.baseUnit}</td>
              </tr>
            ))}
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
