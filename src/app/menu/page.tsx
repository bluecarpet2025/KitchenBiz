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

  return (
    <main className="max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Menu</h1>
      </div>

      {/* Controls row */}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <form action="/menu" method="get" className="flex items-center gap-2">
          <label className="text-sm">Saved menus:</label>
          <select name="menu_id" defaultValue={selectedId ?? ""} className="border rounded-md px-2 py-2">
            {(menus ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name || "Untitled"} • {m.updated_at ? new Date(m.updated_at).toLocaleDateString() : ""}
              </option>
            ))}
          </select>
          <button className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">Load</button>
        </form>

        {/* New Menu styled as button */}
        <Link
          href="/menu/new"
          className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900 inline-flex items-center"
        >
          New Menu
        </Link>

        {/* Save buttons (hook up to your existing handlers/form as needed) */}
        <button className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900" type="button">
          Save
        </button>
        <button className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900" type="button">
          Save as new
        </button>

        {/* Right side actions (same row) */}
        <div className="ml-auto flex items-center gap-2">
          <Link href="/menu/prep" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
            Print
          </Link>
          <Link href="/menu/share" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
            Create share link
          </Link>
        </div>
      </div>

      {/* Two-panel layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        <div className="border rounded-lg p-4">
          <div className="font-semibold mb-2">Pick recipes</div>
          <div className="space-y-3 text-sm">
            {(recipes.length ? recipes : []).map((r) => (
              <div key={r.id} className="flex items-center justify-between">
                <span>{r.name ?? "Untitled"}</span>
                <button className="underline text-xs" type="button">Remove</button>
              </div>
            ))}
            {(!selectedId || menuRecipes.length === 0) && (
              <>
                <div className="text-neutral-400">Add</div>
                <div className="text-neutral-400">Add</div>
                <div className="text-neutral-400">Add</div>
                <div className="text-neutral-400">Add</div>
                <div className="text-neutral-400">Add</div>
                <div className="text-neutral-400">Add</div>
              </>
            )}
          </div>
        </div>

        <div className="border rounded-lg p-4">
          <div className="font-semibold mb-2">Quantities (portions)</div>
          {!selectedId || menuRecipes.length === 0 ? (
            <p className="text-sm text-neutral-400">Add recipes on the left.</p>
          ) : (
            <div className="space-y-3">
              {menuRecipes.map((mr, i) => {
                const name = recipes.find((r) => r.id === mr.recipe_id)?.name ?? "Untitled";
                return (
                  <div key={i} className="flex items-center gap-3">
                    <div className="flex-1">{name}</div>
                    <input
                      className="border rounded px-2 py-1 w-16 text-right"
                      type="number"
                      value={mr.servings}
                      readOnly
                    />
                    <button className="underline text-xs" type="button">Remove</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
