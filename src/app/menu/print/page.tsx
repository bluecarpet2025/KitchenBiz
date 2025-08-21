// src/app/menu/print/page.tsx
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type MenuRow = { id: string; name: string | null; created_at: string | null };
type LineRow = { recipe_id: string; servings: number };
type RecipeRow = { id: string; name: string | null };

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
  props: { searchParams?: Promise<Record<string, string | string[]>> }
) {
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
        <Link className="underline" href="/login?redirect=/menu">Go to login</Link>
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
        <Link className="underline" href="/menu">Back to Menu</Link>
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
  let recipes: RecipeRow[] = [];
  if (rids.length) {
    const { data: recs } = await supabase
      .from("recipes")
      .select("id,name")
      .in("id", rids);
    recipes = (recs ?? []) as RecipeRow[];
  }

  // Map recipe names
  const nameById = new Map<string, string>();
  recipes.forEach(r => nameById.set(r.id, r.name ?? "Untitled"));

  // Stable order by name for print
  const rows = (lines ?? [])
    .map(l => ({ name: nameById.get(l.recipe_id) ?? "Untitled", servings: l.servings }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <main className="mx-auto p-8 max-w-3xl">
      {/* Header (hidden when printing) */}
      <div className="flex items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold">{menu.name || "Menu"}</h1>
          <p className="text-sm opacity-80">Created {fmt(menu.created_at)}</p>
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
                <th className="text-left p-2">Recipe</th>
                <th className="text-right p-2">Portions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t">
                  <td className="p-2">{r.name}</td>
                  <td className="p-2 text-right tabular-nums">{r.servings}</td>
                </tr>
              ))}
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
