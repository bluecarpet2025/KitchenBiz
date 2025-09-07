// src/app/recipes/[id]/page.tsx
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { fmtQty } from "@/lib/format";

export const dynamic = "force-dynamic";

type Recipe = {
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
};

type Item = {
  id: string;
  name: string;
  base_unit: string;
  purchase_unit: string;
  pack_to_base_factor: number;
};

type OnHandRow = {
  item_id: string;
  on_hand_base: number;
};

function toBase(qty: number, unit: string | null | undefined, item: Item | undefined): number {
  const q = Number(qty || 0);
  if (!item) return q;
  const u = (unit || "").toLowerCase();
  const baseU = (item.base_unit || "").toLowerCase();
  const purchU = (item.purchase_unit || "").toLowerCase();

  if (u === baseU) return q;
  if (u === purchU) return q * Number(item.pack_to_base_factor || 1);

  // Fallback: treat as base if unit doesn't match (prevents zeroing out)
  return q;
}

async function getTenant() {
  const supabase = await createServerClient();
  const { data: au } = await supabase.auth.getUser();
  const uid = au.user?.id ?? null;
  if (!uid) return { supabase, tenantId: null };

  const { data: prof } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", uid)
    .maybeSingle();

  return { supabase, tenantId: prof?.tenant_id ?? null };
}

// NOTE: this project expects Promise-style params
type Ctx = { params: Promise<{ id: string }> };

export default async function RecipePage(ctx: Ctx) {
  const { id } = await ctx.params;
  const recipeId = id;

  const { supabase, tenantId } = await getTenant();

  if (!tenantId) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Recipe</h1>
        <p className="mt-4">Sign in required or profile missing tenant.</p>
        <Link className="underline" href="/login?redirect=/recipes">
          Go to login
        </Link>
      </main>
    );
  }

  // Load recipe
  const { data: rec, error: recErr } = await supabase
    .from("recipes")
    .select("id,tenant_id,name,description,batch_yield_qty,batch_yield_unit,yield_pct")
    .eq("tenant_id", tenantId)
    .eq("id", recipeId)
    .maybeSingle();

  if (recErr || !rec) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Recipe</h1>
        <p className="mt-4">Recipe not found.</p>
        <Link className="underline" href="/recipes">Back to recipes</Link>
      </main>
    );
  }

  // Load ingredients
  const { data: ing } = await supabase
    .from("recipe_ingredients")
    .select("id,recipe_id,item_id,sub_recipe_id,qty,unit")
    .eq("recipe_id", recipeId);

  const ingredients = (ing ?? []) as IngredientRow[];

  // Load relevant items
  const itemIds = Array.from(
    new Set(
      ingredients
        .map((r) => r.item_id)
        .filter((x): x is string => !!x)
    )
  );

  let items: Item[] = [];
  if (itemIds.length) {
    const { data: itData } = await supabase
      .from("inventory_items")
      .select("id,name,base_unit,purchase_unit,pack_to_base_factor")
      .in("id", itemIds)
      .eq("tenant_id", tenantId);

    items = (itData ?? []) as Item[];
  }

  const itemMap = new Map(items.map((i) => [i.id, i]));

  // Aggregate per-item required base qty for ONE BATCH
  const requiredByItem = new Map<string, number>();
  for (const r of ingredients) {
    if (!r.item_id) continue; // skip sub-recipes for makeable (we can flatten later)
    const it = itemMap.get(r.item_id);
    const baseQty = toBase(Number(r.qty || 0), r.unit, it);
    if (!Number.isFinite(baseQty) || baseQty <= 0) continue;

    const prev = requiredByItem.get(r.item_id) || 0;
    requiredByItem.set(r.item_id, prev + baseQty);
  }

  // Load on-hand in base units
  const { data: onhandRows } = await supabase
    .from("v_item_on_hand")
    .select("item_id,on_hand_base")
    .eq("tenant_id", tenantId);

  const onHandMap = new Map<string, number>(
    (onhandRows ?? []).map((r: OnHandRow) => [r.item_id, Number(r.on_hand_base || 0)])
  );

  // Compute makeable
  let makeable: number | null = null;
  if (requiredByItem.size > 0) {
    let minBatches = Infinity;
    for (const [itemId, needBase] of requiredByItem.entries()) {
      if (needBase <= 0) continue;
      const have = onHandMap.get(itemId) || 0;
      const canDo = Math.floor(have / needBase);
      minBatches = Math.min(minBatches, canDo);
    }
    makeable = Number.isFinite(minBatches) ? Math.max(0, minBatches) : 0;
  } else {
    makeable = 0; // explicit
  }

  // Prepare rows for display (with formatting)
  const displayRows = ingredients.map((r) => {
    const it = r.item_id ? itemMap.get(r.item_id) : undefined;
    const baseQty = r.item_id ? toBase(Number(r.qty || 0), r.unit, it) : Number(r.qty || 0);
    return {
      id: r.id,
      type: r.item_id ? "item" : "sub",
      name: r.item_id ? it?.name ?? r.item_id : `Sub-recipe ${r.sub_recipe_id?.slice(0, 8) ?? ""}`,
      qty: r.qty,
      unit: r.unit,
      baseQty,
      baseUnit: r.item_id ? it?.base_unit ?? "" : r.unit,
    };
  });

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{rec.name}</h1>
        <div className="flex gap-2">
          <Link href="/recipes" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">Back to recipes</Link>
          <Link href={`/recipes/${rec.id}/edit`} className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">Edit</Link>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <div className="border rounded p-3">
          <div className="text-sm opacity-70">Batch yield</div>
          <div className="text-lg font-medium">
            {fmtQty(rec.batch_yield_qty ?? 0)} {rec.batch_yield_unit ?? ""}
          </div>
        </div>
        <div className="border rounded p-3">
          <div className="text-sm opacity-70">Yield %</div>
          <div className="text-lg font-medium">
            {rec.yield_pct == null ? "—" : `${fmtQty(Number(rec.yield_pct) * 100)}%`}
          </div>
        </div>
        <div className="border rounded p-3">
          <div className="text-sm opacity-70">Makeable (batches)</div>
          <div className="text-lg font-medium">{makeable ?? 0}</div>
        </div>
      </div>

      {rec.description ? (
        <div className="border rounded p-3 text-sm whitespace-pre-wrap">{rec.description}</div>
      ) : null}

      <div className="border rounded overflow-hidden">
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
            {displayRows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-2">{r.name}</td>
                <td className="p-2 text-right tabular-nums">{fmtQty(r.qty)}</td>
                <td className="p-2">{r.unit}</td>
                <td className="p-2 text-right tabular-nums">{fmtQty(r.baseQty)}</td>
                <td className="p-2">{r.baseUnit}</td>
              </tr>
            ))}
            {displayRows.length === 0 && (
              <tr>
                <td className="p-3 text-neutral-400" colSpan={5}>No ingredients yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
