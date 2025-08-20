// src/app/menu/print/page.tsx
import { createServerClient } from "@/lib/supabase/server";
import Link from "next/link";

export const dynamic = "force-dynamic";

type MR = { recipe_id: string; servings: number };
type Recipe = {
  id: string;
  name: string | null;
  batch_yield_qty: number | null;
  batch_yield_unit: string | null;
  yield_pct: number | null;
};

export default async function MenuPrintPage(
  props: { searchParams?: Promise<Record<string, string>> }
) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  const sp = (await props.searchParams) ?? {};
  let selectedId: string | null = sp["menu_id"] ?? null;

  if (!user) {
    return (
      <main className="max-w-3xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Print Menu</h1>
        <p className="mt-4">Sign in required.</p>
        <Link className="underline" href="/login?redirect=/menu/print">Go to login</Link>
      </main>
    );
  }

  const { data: profile } = await supabase
    .from("profiles").select("tenant_id").eq("id", user.id).single();
  const tenantId = profile?.tenant_id ?? null;

  if (!tenantId) {
    return (
      <main className="max-w-3xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Print Menu</h1>
        <p className="mt-4">No tenant.</p>
      </main>
    );
  }

  // Fallback to the most recently created menu (we do NOT use updated_at)
  if (!selectedId) {
    const { data: m } = await supabase
      .from("menus")
      .select("id,name,created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    selectedId = m?.id ?? null;
  }

  if (!selectedId) {
    return (
      <main className="max-w-3xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Print Menu</h1>
        <p className="mt-4">
          No menus yet. Create one in <Link className="underline" href="/menu">Menu</Link>.
        </p>
      </main>
    );
  }

  const { data: menu } = await supabase
    .from("menus")
    .select("id,name,created_at,tenant_id")
    .eq("tenant_id", tenantId)
    .eq("id", selectedId)
    .maybeSingle();

  const { data: mrs } = await supabase
    .from("menu_recipes")
    .select("recipe_id,servings")
    .eq("menu_id", selectedId);

  const rids = (mrs ?? []).map(r => r.recipe_id);
  let recipes: Recipe[] = [];
  if (rids.length) {
    const { data: rs } = await supabase
      .from("recipes")
      .select("id,name,batch_yield_qty,batch_yield_unit,yield_pct")
      .in("id", rids)
      .eq("tenant_id", tenantId);
    recipes = (rs ?? []) as Recipe[];
  }

  return (
    <main className="mx-auto p-8 print:p-0 max-w-3xl">
      <div className="flex items-center justify-between mb-4 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold">{menu?.name ?? "Menu"}</h1>
          <p className="text-sm opacity-80">
            {menu?.created_at ? `Created ${new Date(menu.created_at).toLocaleString()}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/menu" className="px-3 py-2 border rounded-md text-sm">Back</Link>
          <button onClick={() => window.print()} className="px-3 py-2 border rounded-md text-sm">Print</button>
        </div>
      </div>

      <div className="border rounded-lg p-6">
        <ol className="space-y-2 list-decimal pl-6">
          {(mrs ?? []).map((row: MR, i) => {
            const r = recipes.find(x => x.id === row.recipe_id);
            return (
              <li key={i} className="flex justify-between">
                <span>{r?.name ?? "Untitled"}</span>
                <span className="tabular-nums">{row.servings}</span>
              </li>
            );
          })}
          {(!mrs || mrs.length === 0) && (
            <li className="text-neutral-400 list-none">No recipes on this menu.</li>
          )}
        </ol>
      </div>
    </main>
  );
}
