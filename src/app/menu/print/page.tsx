// src/app/menu/print/page.tsx
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import {
  costPerBaseUnit,
  costPerPortion,
  priceFromCost,
  type IngredientRow,
  type ItemCostRow,
  type Recipe as RecipeCostRecipe,
} from "@/lib/costing";

export const dynamic = "force-dynamic";

type MenuRow = { id: string; name: string | null; created_at: string | null; tenant_id: string };
type LineRow = { recipe_id: string; servings: number };
type RecipeRow = {
  id: string;
  name: string | null;
  batch_yield_qty: number | null;
  yield_pct: number | null;
};

function fmt(d?: string | null) {
  if (!d) return "";
  try { return new Date(d).toLocaleString(); } catch { return ""; }
}

/** Small client button so users can print */
function PrintButton() {
  "use client";
  return (
    <button
      onClick={() => window.print()}
      className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900 print:hidden"
    >
      Print
    </button>
  );
}

export default async function MenuPrintPage(
  props: { searchParams?: { [k: string]: string | string[] } }
) {
  const sp = props.searchParams ?? {};
  const menuId = Array.isArray(sp.menu_id) ? sp.menu_id[0] : sp.menu_id;
  const pctParam = Array.isArray(sp.pct) ? sp.pct[0] : sp.pct;
  const foodPct = (() => {
    const p = Number(pctParam);
    return Number.isFinite(p) && p > 0 ? p : 0.30; // default 30%
  })();

  const supabase = await createServerClient();

  // user → tenant guard
  const { data: u } = await supabase.auth.getUser();
  const userId = u.user?.id ?? null;
  if (!userId) {
    return (
      <main className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Menu – Print</h1>
        <p className="mt-4">You need to sign in to view this menu.</p>
        <Link className="underline" href="/login?redirect=/menu">Go to login</Link>
      </main>
    );
  }
  const { data: prof } = await supabase
    .from("profiles").select("tenant_id").eq("id", userId).maybeSingle();
  const tenantId = prof?.tenant_id ?? null;

  if (!tenantId || !menuId) {
    return (
      <main className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Menu – Print</h1>
        <p className="mt-4">Missing menu or tenant.</p>
        <Link className="underline" href="/menu">Back to Menu</Link>
      </main>
    );
  }

  // Menu (tenant check)
  const { data: menu } = await supabase
    .from("menus")
    .select("id,name,created_at,tenant_id")
    .eq("id", menuId)
    .eq("tenant_id", tenantId)
    .maybeSingle() as { data: MenuRow | null };

  if (!menu) {
    return (
      <main className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Menu – Print</h1>
        <p className="mt-4">Menu not found.</p>
        <Link className="underline" href="/menu">Back to Menu</Link>
      </main>
    );
  }

  // Lines
  const { data: lines } = await supabase
    .from("menu_recipes")
    .select("recipe_id,servings")
    .eq("menu_id", menu.id);
  const rids = (lines ?? []).map(l => l.recipe_id);

  // Recipes with yields
  let recipes: RecipeRow[] = [];
  if (rids.length) {
    const { data: recs } = await supabase
      .from("recipes")
      .select("id,name,batch_yield_qty,yield_pct")
      .in("id", rids);
    recipes = (recs ?? []) as RecipeRow[];
  }

  // Ingredients for those recipes
  const { data: ingRows } = await supabase
    .from("recipe_ingredients")
    .select("recipe_id,item_id,qty")
    .in("recipe_id", rids);
  const ings = (ingRows ?? []) as IngredientRow[];

  // Item costs
  const { data: itemRows } = await supabase
    .from("inventory_items")
    .select("id,last_price,pack_to_base_factor")
    .eq("tenant_id", tenantId);
  const itemCosts: Record<string, number> = {};
  (itemRows ?? []).forEach((it: ItemCostRow) => {
    itemCosts[it.id] = costPerBaseUnit(it.last_price, it.pack_to_base_factor);
  });

  // Maps for calc
  const recById = new Map(recipes.map(r => [r.id, r]));
  const nameById = new Map(recipes.map(r => [r.id, r.name ?? "Untitled"]));
  const ingsByRec = new Map<string, IngredientRow[]>();
  for (const r of rids) ingsByRec.set(r, []);
  for (const row of ings) {
    if (!ingsByRec.has(row.recipe_id)) ingsByRec.set(row.recipe_id, []);
    ingsByRec.get(row.recipe_id)!.push(row);
  }

  const rows = (lines ?? []).map(l => {
    const rec = recById.get(l.recipe_id) as RecipeCostRecipe | undefined;
    const ing = ingsByRec.get(l.recipe_id) ?? [];
    const c = rec ? costPerPortion(rec, ing, itemCosts) : 0;
    const unitPrice = priceFromCost(c, foodPct);
    const line = unitPrice * (l.servings || 0);
    return {
      name: nameById.get(l.recipe_id) ?? "Untitled",
      qty: l.servings || 0,
      unitPrice,
      line,
      cost: c,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  const total = rows.reduce((s, r) => s + r.line, 0);

  return (
    <main className="mx-auto p-8 max-w-3xl">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold">{menu.name || "Menu"}</h1>
          <p className="text-sm opacity-80">Created {fmt(menu.created_at)} • Food cost target {(foodPct*100).toFixed(0)}%</p>
        </div>
        <div className="flex gap-2">
          <PrintButton />
          <Link href="/menu" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
            Back to Menu
          </Link>
        </div>
      </div>

      <section className="mt-6 border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900/60">
            <tr>
              <th className="text-left p-2">Item</th>
              <th className="text-right p-2">Qty</th>
              <th className="text-right p-2">Price</th>
              <th className="text-right p-2">Line</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t">
                <td className="p-2">
                  <div className="font-medium">{r.name}</div>
                  <div className="text-xs opacity-70">Cost/portion ${r.cost.toFixed(2)}</div>
                </td>
                <td className="p-2 text-right tabular-nums">{r.qty}</td>
                <td className="p-2 text-right tabular-nums">${r.unitPrice.toFixed(2)}</td>
                <td className="p-2 text-right tabular-nums">${r.line.toFixed(2)}</td>
              </tr>
            ))}
            <tr className="border-t font-semibold">
              <td className="p-2" colSpan={3}>Total</td>
              <td className="p-2 text-right tabular-nums">${total.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <style>{`
        @media print {
          .print\\:hidden { display: none !important; }
          main { padding: 0 !important; }
          section { border: none !important; }
          table { page-break-inside: avoid; }
        }
      `}</style>
    </main>
  );
}
