// src/app/menu/print/page.tsx
import Link from 'next/link';
import { createServerClient } from '@/lib/supabase/server';
import {
  costPerBaseUnit,
  costPerPortion,
  priceFromCost,
  fmtUSD,
  type RecipeLike,
  type IngredientLine,
} from '@/lib/costing';
import PrintCopyActions from '@/components/PrintCopyActions';

export const dynamic = 'force-dynamic';

function fmtDate(d?: string | null) {
  if (!d) return '';
  try {
    return new Date(d).toLocaleString();
  } catch {
    return '';
  }
}

type RecipeRow = RecipeLike & {
  name: string | null;
  menu_description: string | null;
};

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[]>>;
}) {
  // Next 15 gives searchParams as a Promise
  const sp = (await searchParams) ?? {};
  const menuId = Array.isArray(sp.menu_id) ? sp.menu_id[0] : sp.menu_id;
  const marginParam = Array.isArray(sp.margin) ? sp.margin[0] : sp.margin;
  // Margin here is the **food-cost percent** (e.g. 0.30 = 30% food cost).
  const margin = Math.min(0.9, Math.max(0, marginParam ? Number(marginParam) : 0.3));

  const supabase = await createServerClient();

  // auth → tenant
  const { data: u } = await supabase.auth.getUser();
  const userId = u.user?.id ?? null;
  if (!userId) {
    return (
      <main className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Menu</h1>
        <p className="mt-4">You need to sign in to view this menu.</p>
        <Link className="underline" href="/login?redirect=/menu">
          Go to login
        </Link>
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
        <h1 className="text-2xl font-semibold">Menu</h1>
        <p className="mt-4">Missing menu or tenant.</p>
        <Link className="underline" href="/menu">
          Back to Menu
        </Link>
      </main>
    );
  }

  // menu
  const { data: menu } = await supabase
    .from('menus')
    .select('id,name,created_at,tenant_id')
    .eq('id', String(menuId))
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (!menu) {
    return (
      <main className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Menu</h1>
        <p className="mt-4">Menu not found.</p>
        <Link className="underline" href="/menu">
          Back to Menu
        </Link>
      </main>
    );
  }

  // lines → recipe ids
  const { data: lines } = await supabase
    .from('menu_recipes')
    .select('recipe_id,servings')
    .eq('menu_id', menu.id);

  // Ensure string[] (TS: filter out nulls)
  const rids: string[] = (lines ?? [])
    .map((l) => l.recipe_id)
    .filter((v): v is string => typeof v === 'string' && v.length > 0);

  // recipes (include printable description)
  let recipes: RecipeRow[] = [];
  if (rids.length) {
    const { data: recs } = await supabase
      .from('recipes')
      .select('id,name,batch_yield_qty,batch_yield_unit,yield_pct,menu_description')
      .in('id', rids);
    recipes = (recs ?? []) as RecipeRow[];
  }

  // ingredients for those recipes
  let ingredients: IngredientLine[] = [];
  if (rids.length) {
    const { data: ing } = await supabase
      .from('recipe_ingredients')
      .select('recipe_id,item_id,qty')
      .in('recipe_id', rids);
    ingredients = (ing ?? []) as IngredientLine[];
  }

  // item costs map
  const { data: itemsRaw } = await supabase
    .from('inventory_items')
    .select('id,last_price,pack_to_base_factor')
    .eq('tenant_id', tenantId);

  const itemCostById: Record<string, number> = {};
  (itemsRaw ?? []).forEach((it: any) => {
    itemCostById[String(it.id)] = costPerBaseUnit(
      Number(it.last_price ?? 0),
      Number(it.pack_to_base_factor ?? 0)
    );
  });

  // group ingredients per recipe
  const ingByRecipe = new Map<string, IngredientLine[]>();
  (ingredients ?? []).forEach((ing) => {
    const rid = String(ing.recipe_id);
    if (!ingByRecipe.has(rid)) ingByRecipe.set(rid, []);
    ingByRecipe.get(rid)!.push(ing);
  });

  // rows for print (name, description, price at desired margin)
  const rows = recipes
    .map((rec) => {
      const rid = String(rec.id);
      const parts = ingByRecipe.get(rid) ?? [];
      const costEach = costPerPortion(rec, parts, itemCostById); // raw cost per portion
      const price = priceFromCost(costEach, margin); // selling price based on food-cost %
      return {
        name: rec.name ?? 'Untitled',
        descr: (rec.menu_description ?? '').trim(),
        price,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <main className="mx-auto p-8 max-w-4xl">
      {/* Header (no event handlers in server; client actions are isolated) */}
      <div className="flex items-start justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold">{menu.name || 'Menu'}</h1>
          <p className="text-sm opacity-80">Created {fmtDate(menu.created_at)}</p>
        </div>
        <div className="flex gap-2">
          <PrintCopyActions />
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
          <table className="w-full text-sm leading-6">
            <thead className="print:table-header-group bg-neutral-900/60">
              <tr>
                <th className="text-left p-2 w-[30%]">Item</th>
                <th className="text-left p-2 w-[55%]">Description</th>
                <th className="text-right p-2 w-[15%]">Price</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t align-top">
                  <td className="p-2">{r.name}</td>
                  <td className="p-2 whitespace-pre-wrap">{r.descr || '—'}</td>
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
