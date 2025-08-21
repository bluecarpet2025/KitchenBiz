// src/app/menu/print/page.tsx
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs"; // hard-pin Node runtime (avoid Edge issues)

type LineRow = { recipe_id: string; servings: number };
type RecipeRow = { id: string; name: string | null };

function fmt(d?: string | null) {
  if (!d) return "";
  try { return new Date(d).toLocaleString(); } catch { return ""; }
}

function ErrorBox({ title, detail }: { title: string; detail?: string }) {
  return (
    <main className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-semibold">Menu – Print</h1>
      <p className="mt-4 text-red-400">{title}</p>
      {detail && <pre className="mt-2 text-xs opacity-80 whitespace-pre-wrap">{detail}</pre>}
      <Link href="/menu" className="underline mt-6 inline-block">Back to Menu</Link>
    </main>
  );
}

/** Small client-only print button */
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
  props: { searchParams?: Promise<Record<string, string | string[]>> | Record<string, string | string[]> }
) {
  // Handle both shapes: Promise or plain object
  let sp: Record<string, string | string[]> = {};
  const maybe = (props as any)?.searchParams;
  try {
    sp =
      maybe && typeof maybe.then === "function"
        ? (await maybe)
        : (maybe ?? {});
  } catch {
    sp = {};
  }
  const menuIdRaw = sp["menu_id"];
  const menuId = Array.isArray(menuIdRaw) ? menuIdRaw[0] : menuIdRaw;

  // Supabase server client
  const supabase = await createServerClient();

  // Get user → tenant
  let userId: string | null = null;
  let tenantId: string | null = null;
  try {
    const { data: u, error: uErr } = await supabase.auth.getUser();
    if (uErr) console.error("auth.getUser error", uErr);
    userId = u?.user?.id ?? null;

    if (!userId) {
      return (
        <ErrorBox
          title="You need to sign in to view this menu."
          detail="No user session."
        />
      );
    }

    const { data: prof, error: pErr } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", userId)
      .maybeSingle();
    if (pErr) console.error("profiles error", pErr);
    tenantId = prof?.tenant_id ?? null;
  } catch (e: any) {
    console.error("tenant lookup failure", e);
    return <ErrorBox title="Could not resolve tenant." detail={String(e?.message ?? e)} />;
  }

  if (!tenantId) {
    return <ErrorBox title="Missing tenant." />;
  }
  if (!menuId) {
    return <ErrorBox title="Missing menu id." />;
  }

  // Load the menu (scoped to tenant)
  let menu: { id: string; name: string | null; created_at: string | null } | null = null;
  try {
    const { data, error } = await supabase
      .from("menus")
      .select("id,name,created_at,tenant_id")
      .eq("id", menuId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error) console.error("menus error", error);
    menu = data ? { id: data.id, name: data.name, created_at: data.created_at } : null;
  } catch (e: any) {
    console.error("menus catch", e);
    return <ErrorBox title="Failed to load menu." detail={String(e?.message ?? e)} />;
  }

  if (!menu) {
    return <ErrorBox title="Menu not found for this tenant." />;
  }

  // Load lines
  let lines: LineRow[] = [];
  try {
    const { data, error } = await supabase
      .from("menu_recipes")
      .select("recipe_id,servings")
      .eq("menu_id", menu.id);
    if (error) console.error("menu_recipes error", error);
    lines = (data ?? []) as LineRow[];
  } catch (e: any) {
    console.error("menu_recipes catch", e);
    // Keep going with empty lines
    lines = [];
  }

  // Load recipe names
  let recipes: RecipeRow[] = [];
  const recipeIds = [...new Set(lines.map(l => l.recipe_id))];
  if (recipeIds.length) {
    try {
      const { data, error } = await supabase
        .from("recipes")
        .select("id,name")
        .in("id", recipeIds);
      if (error) console.error("recipes error", error);
      recipes = (data ?? []) as RecipeRow[];
    } catch (e: any) {
      console.error("recipes catch", e);
      recipes = [];
    }
  }

  const nameById = new Map<string, string>();
  recipes.forEach(r => nameById.set(r.id, r.name ?? "Untitled"));

  const rows = lines
    .map(l => ({ name: nameById.get(l.recipe_id) ?? "Untitled", servings: l.servings }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <main className="mx-auto p-8 max-w-3xl">
      {/* Header (hidden on print) */}
      <div className="flex items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold">{menu.name || "Menu"}</h1>
        </div>
        <div className="flex gap-2">
          <PrintButton />
          <Link href="/menu" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
            Back to Menu
          </Link>
        </div>
      </div>

      {/* Content */}
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
        <p className="mt-3 text-xs opacity-70 print:hidden">Created {fmt(menu.created_at)}</p>
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
