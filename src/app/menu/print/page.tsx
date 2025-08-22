import Link from 'next/link';
import { createServerClient } from '@/lib/supabase/server';
import PrintButton from '@/components/PrintButton';
import { costPerBaseUnit, costPerPortion, priceFromCost, fmtUSD } from '@/lib/costing';

export const dynamic = 'force-dynamic';

type RecipeRow = {
  id: string;
  name: string | null;
  description: string | null;           // NEW
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
  // Next 15 passes searchParams as a Promise
  searchParams?: Promise<Record<string, string | string[]>>;
}) {
  const sp = (await searchParams) ?? {};
  const menuId = Array.isArray(sp.menu_id) ? sp.menu_id[0] : sp.menu_id;
  const marginParam = Array.isArray(sp.margin) ? sp.margin[0] : sp.margin;
  const margin = Math.min(0.9, Math.max(0, marginParam ? Number(marginParam) : 0.3)); // default 30%

  const supabase = await createServerClient();

  // auth → tenant
  const { data: u } = await supabase.auth.getUser();
  const userId = u.user?.id ?? null;
  if (!userId) {
    return (
      <main className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Menu</h1>
        <p className="mt-4">You need to sign in to view this menu.</p>
        <Link className="underline" href="/login?redirect=/menu">Go to login</Link>
      </main>
    );
  }
  const { data: prof } = await supabase.from('profiles').select('tenant_id').eq('id', userId).maybeSingle();
  const tenantId = prof?.tenant_id ?? null;

  if (!tenantId || !menuId) {
    return (
      <main className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Menu</h1>
        <p className="mt-4">Missing menu or tenant.</p>
        <Link className="underline" href="/menu">Back to Menu</Link>
      </main>
    );
  }

  // menu
  const { data: menu } = await supabase
    .from('menus')
    .select('id,name,created_at,tenant_id')
    .eq('id', menuId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (!menu) {
    return (
      <main className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Menu</h1>
        <p className="mt-4">Menu not found.</p>
        <Link className="underline" href="/menu">Back to Menu</Link>
      </main>
    );
  }

  // lines
  const { data: lines } = await supabase
    .from('menu_recipes')
    .select('recipe_id,servings')
    .eq('menu_id', menu.id);

  const rids = (lines ?? []).map(l => l.recipe_id);
  const servingsByRecipe = new Map<string, number>();
  (lines ?? []).forEach(l => servingsByRecipe.set(l.recipe_id, Number(l.servings ?? 0)));

  // recipes (includes description)
  let recipes: RecipeRow[] = [];
  if (rids.length) {
    const { data: recs } = await supabase
      .from('recipes')
      .select('id,name,description,batch_yield_qty,batch_yield_unit,yield_pct')
      .in('id', rids);
    recipes = (recs ?? []) as RecipeRow[];
  }

  // ingredients
  let ingredients: IngredientRow[] = [];
  if (rids.length) {
    const { data: ing } = await supabase
      .from('recipe_ingredients')
      .select('recipe_id,item_id,qty')
      .in('recipe_id', rids);
    ingredients = (ing ?? []) as IngredientRow[];
  }

  // item cost map
  const { data: itemsRaw } = await supabase
    .from('inventory_items')
    .select('id,last_price,pack_to_base_factor')
    .eq('tenant_id', tenantId);

  const itemCostById: Record<string, number> = {};
  (itemsRaw ?? []).forEach((it: any) => {
    itemCostById[it.id] = costPerBaseUnit(Number(it.last_price ?? 0), Number(it.pack_to_base_factor ?? 0));
  });

  // group ingredients → recipeId
  const ingByRecipe = new Map<string, IngredientRow[]>();
  (ingredients ?? []).forEach(ing => {
    if (!ingByRecipe.has(ing.recipe_id)) ingByRecipe.set(ing.recipe_id, []);
    ingByRecipe.get(ing.recipe_id)!.push(ing);
  });

  // build rows (Item • Description • Price)
  const rows = recipes
    .map(rec => {
      const parts = ingByRecipe.get(rec.id) ?? [];
      const costEach = costPerPortion(rec, parts, itemCostById);
      const unitPrice = priceFromCost(costEach, margin);
      return {
        name: rec.name ?? 'Untitled',
        desc: rec.description ?? '',
        price: unitPrice,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <main className="mx-auto p-8 max-w-3xl">
      {/* Header (hidden in print) */}
      <div className="flex items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold">{menu.name || 'Menu'}</h1>
          <p className="text-sm opacity-80">Created {fmtDate(menu.created_at)}</p>
        </div>
        <div className="flex gap-2">
          <PrintButton className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900 print:hidden" />
          <Link href="/menu" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">Back to Menu</Link>
        </div>
      </div>

      {/* Printable content */}
      <section className="mt-6 border rounded-lg p-6">
        {rows.length === 0 ? (
          <p className="text-neutral-400">No items in this menu.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="print:table-header-group bg-neutral-900/60">
              <tr>
                <th className="text-left p-2 w-[60%]">Item</th>
                <th className="text-left p-2">Description</th>
                <th className="text-right p-2 w-[15%]">Price</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t align-top">
                  <td className="p-2 font-medium">{r.name}</td>
                  <td className="p-2 text-neutral-300">{r.desc}</td>
                  <td className="p-2 text-right tabular-nums">{fmtUSD(r.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Print styles */}
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
