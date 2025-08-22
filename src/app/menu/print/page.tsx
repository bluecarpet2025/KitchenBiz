// src/app/menu/print/page.tsx
import Link from 'next/link';
import { createServerClient } from '@/lib/supabase/server';
import { costPerBaseUnit, costPerPortion, priceFromCost, fmtUSD } from '@/lib/costing';

export const dynamic = 'force-dynamic';

// tiny client-only button so the page can print
function PrintButton() {
  'use client';
  return (
    <button
      onClick={() => window.print()}
      className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900 print:hidden"
    >
      Print
    </button>
  );
}

type RecipeRow = {
  id: string;
  name: string | null;
  batch_yield_qty: number | null;
  batch_yield_unit: string | null;
  yield_pct: number | null;
};
type IngredientRow = { recipe_id: string; item_id: string; qty: number | null };

function fmtDate(d?: string | null) {
  if (!d) return '';
  try { return new Date(d).toLocaleString(); } catch { return ''; }
}

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[]>>;
}) {
  // Next 15 passes searchParams as a Promise
  const sp = (await searchParams) ?? {};
  const menuId = Array.isArray(sp.menu_id) ? sp.menu_id[0] : sp.menu_id;

  // margin comes in as 0..1 (string); default 0.30 if missing/bad
  const marginParam = Array.isArray(sp.margin) ? sp.margin[0] : sp.margin;
  let margin = Number(marginParam);
  if (!Number.isFinite(margin)) margin = 0.3;
  margin = Math.max(0, Math.min(0.9, margin));

  const supabase = await createServerClient();

  // Require auth → tenant
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
    .from('profiles')
    .select('tenant_id')
    .eq('id', userId)
    .maybeSingle();
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

  // Menu (scoped)
  const { data: menu } = await supabase
    .from('menus')
    .select('id,name,created_at,tenant_id')
    .eq('id', menuId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
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
    .from('menu_recipes')
    .select('recipe_id,servings')
    .eq('menu_id', menu.id);

  const rids = (lines ?? []).map((l) => l.recipe_id);
  const servingsByRecipe = new Map<string, number>();
  (lines ?? []).forEach((l: any) => {
    servingsByRecipe.set(l.recipe_id, Number(l.servings ?? 0));
  });

  // Recipes with yield fields
  let recipes: RecipeRow[] = [];
  if (rids.length) {
    const { data: recs } = await supabase
      .from('recipes')
      .select('id,name,batch_yield_qty,batch_yield_unit,yield_pct')
      .in('id', rids);
    recipes = (recs ?? []) as RecipeRow[];
  }

  // Ingredients (normalize qty)
  let ingredients: IngredientRow[] = [];
  if (rids.length) {
    const { data: ing } = await supabase
      .from('recipe_ingredients')
      .select('recipe_id,item_id,qty')
      .in('recipe_id', rids);
    ingredients = (ing ?? []) as IngredientRow[];
  }

  // Item base-unit costs (guard bad pack factors)
  const { data: itemsRaw } = await supabase
    .from('inventory_items')
    .select('id,last_price,pack_to_base_factor')
    .eq('tenant_id', tenantId);

  const itemCostById: Record<string, number> = {};
  (itemsRaw ?? []).forEach((it: any) => {
    const price = Number(it.last_price ?? 0);
    const factor = Number(it.pack_to_base_factor ?? 0);
    itemCostById[it.id] = costPerBaseUnit(price, factor);
  });

  // Group ingredients per recipe with safe qty
  const ingByRecipe = new Map<string, IngredientRow[]>();
  (ingredients ?? []).forEach((ing) => {
    if (!ingByRecipe.has(ing.recipe_id)) ingByRecipe.set(ing.recipe_id, []);
    // push a normalized copy (qty always a number)
    ingByRecipe.get(ing.recipe_id)!.push({
      ...ing,
      qty: Number(ing.qty ?? 0),
    });
  });

  type Row = { name: string; qty: number; unit: number; line: number };

  const rows: Row[] = recipes
    .map((rec) => {
      const parts = ingByRecipe.get(rec.id) ?? [];
      const costEach = costPerPortion(rec, parts, itemCostById); // cost/portion
      const unitPrice = priceFromCost(costEach, margin);         // selling price/portion
      const qty = servingsByRecipe.get(rec.id) ?? 0;
      return {
        name: rec.name ?? 'Untitled',
        qty,
        unit: unitPrice,
        line: unitPrice * qty,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const total = rows.reduce((s, r) => s + r.line, 0);

  return (
    <main className="mx-auto p-8 max-w-3xl">
      {/* Header (hidden in print) */}
      <div className="flex items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold">{menu.name || 'Menu'}</h1>
          <p className="text-sm opacity-80">Created {fmtDate(menu.created_at)}</p>
          <p className="text-xs opacity-70">Margin: {(margin * 100).toFixed(0)}%</p>
        </div>
        <div className="flex gap-2">
          <PrintButton />
          <Link href="/menu" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
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
                  <td className="p-2 text-right tabular-nums">{fmtUSD(r.unit)}</td>
                  <td className="p-2 text-right tabular-nums">{fmtUSD(r.line)}</td>
                </tr>
              ))}
              <tr className="border-t">
                <td className="p-2 font-semibold" colSpan={3}>Total</td>
                <td className="p-2 text-right font-semibold tabular-nums">{fmtUSD(total)}</td>
              </tr>
            </tbody>
          </table>
        )}
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
