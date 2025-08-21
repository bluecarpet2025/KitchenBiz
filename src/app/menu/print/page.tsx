// src/app/menu/print/page.tsx
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import {
  costPerBaseUnit,
  costPerServing,
  suggestedPrice,
  fmtUSD,
  type IngredientLine,
  type RecipeLike,
} from "@/lib/costing";

export const dynamic = "force-dynamic";

type MenuRow = { id: string; name: string | null; created_at: string | null };
type LineRow = { recipe_id: string; servings: number };
type RecipeRow = RecipeLike & { id: string; name: string | null };

function fmtDate(d?: string | null) {
  if (!d) return "";
  try {
    return new Date(d).toLocaleString();
  } catch {
    return "";
  }
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

export default async function MenuPrintPage(props: {
  searchParams?: Promise<Record<string, string | string[]>>;
}) {
  // In this project searchParams is a Promise → await it
  const sp = (await props.searchParams) ?? {};
  const menuId = Array.isArray(sp.menu_id) ? sp.menu_id[0] : sp.menu_id;

  const supabase = await createServerClient();

  // user → tenant
  const { data: u } = await supabase.auth.getUser();
  const userId = u.user?.id ?? null;
  if (!userId) {
    return (
      <main className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Menu – Print</h1>
        <p className="mt-4">You need to sign in to view this menu.</p>
        <Link className="underline" href="/login?redirect=/menu">
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

  if (!tenantId || !menuId) {
    return (
      <main className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Menu – Print</h1>
        <p className="mt-4">Missing menu or tenant.</p>
        <Link className="underline" href="/menu">
          Back to Menu
        </Link>
      </main>
    );
  }

  // Get the menu (safe‑check tenant ownership)
  const { data: menu } = await supabase
    .from("menus")
    .select("id,name,created_at,tenant_id")
    .eq("id", menuId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!menu) {
    return (
      <main className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Menu – Print</h1>
        <p className="mt-4">Menu not found.</p>
        <Link className="underline" href="/menu">
          Back to Menu
        </Link>
      </main>
    );
  }

  // Lines in this menu
  const { data: linesRaw } = await supabase
    .from("menu_recipes")
    .select("recipe_id,servings")
    .eq("menu_id", menu.id);
  const lines: LineRow[] = (linesRaw ?? []) as LineRow[];

  const rids = lines.map((l) => l.recipe_id);
  let recipes: RecipeRow[] = [];
  if (rids.length) {
    const { data: recs } = await supabase
      .from("recipes")
      .select("id,name,batch_yield_qty,yield_pct")
      .in("id", rids)
      .eq("tenant_id", tenantId);
    recipes = (recs ?? []) as RecipeRow[];
  }

  // Ingredients for those recipes
  let ingRows: { recipe_id: string; item_id: string; qty: number | null }[] =
    [];
  if (rids.length) {
    const { data: ing } = await supabase
      .from("recipe_ingredients")
      .select("recipe_id,item_id,qty")
      .in("recipe_id", rids);
    ingRows = (ing ?? []) as any[];
  }

  // All item_ids referenced by the ingredients
  const itemIds = Array.from(new Set(ingRows.map((r) => r.item_id)));
  type ItemRow = {
    id: string;
    last_price: number | null;
    pack_to_base_factor: number | null;
  };
  let itemRows: ItemRow[] = [];
  if (itemIds.length) {
    const { data: its } = await supabase
      .from("inventory_items")
      .select("id,last_price,pack_to_base_factor")
      .in("id", itemIds)
      .eq("tenant_id", tenantId);
    itemRows = (its ?? []) as ItemRow[];
  }

  // Build unit‑cost map $/base
  const unitCostByItemId: Record<string, number> = {};
  (itemRows ?? []).forEach((it) => {
    unitCostByItemId[it.id] = costPerBaseUnit(
      it.last_price,
      it.pack_to_base_factor
    );
  });

  // Group ingredients per recipe
  const ingByRecipe = new Map<string, IngredientLine[]>();
  for (const row of ingRows) {
    if (!ingByRecipe.has(row.recipe_id)) ingByRecipe.set(row.recipe_id, []);
    ingByRecipe.get(row.recipe_id)!.push({
      item_id: row.item_id,
      qty: row.qty,
    });
  }

  // Calculate prices
  const DEFAULT_MARGIN = 30; // %
  const rows = lines
    .map((l) => {
      const rec = recipes.find((r) => r.id === l.recipe_id);
      if (!rec) return null;
      const ings = ingByRecipe.get(rec.id) ?? [];
      const cost = costPerServing({
        recipe: rec,
        ingredients: ings,
        itemCostById: unitCostByItemId,
      });
      const priceEach = suggestedPrice(cost, DEFAULT_MARGIN);
      const line = priceEach * l.servings;
      return {
        name: rec.name ?? "Untitled",
        qty: l.servings,
        priceEach,
        line,
      };
    })
    .filter(Boolean) as { name: string; qty: number; priceEach: number; line: number }[];

  const total = rows.reduce((acc, r) => acc + r.line, 0);

  return (
    <main className="mx-auto p-8 max-w-3xl">
      {/* Header (hidden when printing) */}
      <div className="flex items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold">{menu.name || "Menu"}</h1>
          <p className="text-sm opacity-80">Created {fmtDate(menu.created_at)}</p>
        </div>
        <div className="flex gap-2">
          <PrintButton />
          <Link
            href="/menu"
            className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
          >
            Back to Menu
          </Link>
        </div>
      </div>

      {/* Printable content */}
      <section className="mt-6 border rounded-lg p-6">
        {rows.length === 0 ? (
          <p className="text-neutral-400">No recipes in this menu.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="print:table-header-group bg-neutral-900/60">
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
                  <td className="p-2">{r.name}</td>
                  <td className="p-2 text-right tabular-nums">{r.qty}</td>
                  <td className="p-2 text-right tabular-nums">
                    {fmtUSD(r.priceEach)}
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {fmtUSD(r.line)}
                  </td>
                </tr>
              ))}
              <tr className="border-t bg-neutral-900/40">
                <td className="p-2 font-medium" colSpan={3}>
                  Total
                </td>
                <td className="p-2 text-right font-semibold tabular-nums">
                  {fmtUSD(total)}
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </section>

      {/* Simple print styles */}
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
