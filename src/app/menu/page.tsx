// src/app/menu/page.tsx
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type MenuRow = { id: string; name: string | null; updated_at: string | null };

async function getTenant(supabase: Awaited<ReturnType<typeof createServerClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, tenantId: null };
  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .single();
  return { user, tenantId: profile?.tenant_id ?? null };
}

export default async function MenuPage(
  props: { searchParams?: Promise<Record<string, string | string[]>> }
) {
  const supabase = await createServerClient();
  const { user, tenantId } = await getTenant(supabase);

  if (!user || !tenantId) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Menu</h1>
        <p className="mt-4">Sign in required.</p>
        <Link href="/login?redirect=/menu" className="underline">Go to login</Link>
      </main>
    );
  }

  const sp = (await props.searchParams) ?? {};
  const selectedParam = sp["menu_id"];
  const selectedFromQuery =
    typeof selectedParam === "string"
      ? selectedParam
      : Array.isArray(selectedParam)
        ? selectedParam[0]
        : undefined;

  const { data: menus } = await supabase
    .from("menus")
    .select("id, name, updated_at")
    .eq("tenant_id", tenantId)
    .order("updated_at", { ascending: false })
    .returns<MenuRow[]>();

  const selectedId = selectedFromQuery || menus?.[0]?.id || null;

  let menuRecipes: { recipe_id: string; servings: number }[] = [];
  let recipes: { id: string; name: string | null }[] = [];

  if (selectedId) {
    const { data: mr } = await supabase
      .from("menu_recipes")
      .select("recipe_id, servings")
      .eq("menu_id", selectedId);
    menuRecipes = mr ?? [];

    const rids = menuRecipes.map((m) => m.recipe_id);
    if (rids.length > 0) {
      const { data: rs } = await supabase
        .from("recipes")
        .select("id, name")
        .in("id", rids);
      recipes = rs ?? [];
    }
  }

  const createdFlag = (sp["created"] === "1");

  return (
    <main className="max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Menu</h1>
        <div className="flex gap-2">
          <Link href="/menu/prep" className="px-3 py-2 border rounded-md text-sm hover:bg-muted">Prep</Link>
          <Link href="/menu/print" className="px-3 py-2 border rounded-md text-sm hover:bg-muted">Print</Link>
        </div>
      </div>

      {createdFlag && (
        <p className="mt-2 text-xs text-emerald-400">
          New menu created. Use Prep to build it, or Print when ready.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <form action="/menu" method="get" className="flex items-center gap-2">
          <label className="text-sm">Saved menus:</label>
          <select name="menu_id" defaultValue={selectedId ?? ""} className="border rounded-md px-2 py-1">
            {(menus ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name || "Untitled"} • {m.updated_at ? new Date(m.updated_at).toLocaleDateString() : ""}
              </option>
            ))}
          </select>
          <button className="px-3 py-2 border rounded-md text-sm hover:bg-muted">Load</button>
        </form>
        <Link href="/menu/new" className="text-sm underline">New Menu</Link>
      </div>

      <div className="mt-6">
        {!selectedId && (
          <p className="text-sm text-muted-foreground">No menus yet. Create one to get started.</p>
        )}
        {selectedId && (
          <div className="border rounded-lg p-4">
            <h2 className="text-lg font-medium mb-2">Recipes in this menu</h2>
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-2">Recipe</th>
                  <th className="text-right p-2">Servings</th>
                </tr>
              </thead>
              <tbody>
                {menuRecipes.map((mr, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-2">{recipes.find((r) => r.id === mr.recipe_id)?.name ?? "Untitled"}</td>
                    <td className="p-2 text-right">{mr.servings}</td>
                  </tr>
                ))}
                {menuRecipes.length === 0 && (
                  <tr>
                    <td colSpan={2} className="p-2 text-sm text-muted-foreground">
                      No recipes in this menu.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
