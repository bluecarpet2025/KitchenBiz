"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  fmtUSD,
  costPerBaseUnit,
  buildRecipeCostIndex,
  type ItemCostById,
  type RecipeLike,
  type IngredientLine,
} from "@/lib/costing";

type MenuRow = { id: string; name: string | null; created_at: string | null };
type RecipeRow = RecipeLike;
type Sel = Record<string, number>;           // recipeId -> 1 (in menu)
type Overrides = Record<string, number>;     // recipeId -> manual price override (per portion)
type RoundEnding = ".00" | ".49" | ".79" | ".89" | ".95" | ".99";

function applyEnding(n: number, ending: RoundEnding) {
  const whole = Math.floor(n);
  const cents = Number(ending.slice(1));
  const candidate = whole + cents / 100;
  return candidate < n ? candidate + 1 : candidate;
}

export default function MenuPageClient({ initialTenantId }: { initialTenantId: string | null }) {
  const router = useRouter();

  const [tenantId, setTenantId] = useState<string | null>(initialTenantId);
  const [menus, setMenus] = useState<MenuRow[]>([]);
  const [selectedMenuId, setSelectedMenuId] = useState<string | null>(null);
  const [recipes, setRecipes] = useState<RecipeRow[]>([]);
  const [ingredients, setIngredients] = useState<IngredientLine[]>([]);
  const [itemCostById, setItemCostById] = useState<ItemCostById>({});
  const [sel, setSel] = useState<Sel>({});
  const [overrides, setOverrides] = useState<Overrides>({});
  const [margin, setMargin] = useState(0.30);
  const [ending, setEnding] = useState<RoundEnding>(".99");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // boot: confirm auth, then hydrate lists using the server-passed tenant
  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user?.id) { setStatus("Sign in required."); return; }
      if (!tenantId) { setStatus("No tenant."); return; }

      // Menus
      const { data: ms } = await supabase
        .from("menus")
        .select("id,name,created_at")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });
      const list = (ms ?? []) as MenuRow[];
      setMenus(list);
      setSelectedMenuId(list?.[0]?.id ?? null);

      // Recipes
      const { data: recs } = await supabase
        .from("recipes")
        .select("id,name,batch_yield_qty,batch_yield_unit,yield_pct,menu_description")
        .eq("tenant_id", tenantId)
        .order("name");
      setRecipes((recs ?? []) as RecipeRow[]);

      // Ingredients (include sub_recipe_id & unit)
      const { data: ing } = await supabase
        .from("recipe_ingredients")
        .select("id,recipe_id,item_id,sub_recipe_id,qty,unit");
      setIngredients((ing ?? []) as IngredientLine[]);

      // Inventory item costs
      const { data: items } = await supabase
        .from("inventory_items")
        .select("id,last_price,pack_to_base_factor")
        .eq("tenant_id", tenantId);
      const costMap: ItemCostById = {};
      (items ?? []).forEach((it: any) => {
        costMap[it.id] = costPerBaseUnit(
          Number(it.last_price ?? 0),
          Number(it.pack_to_base_factor ?? 0)
        );
      });
      setItemCostById(costMap);
    })();
  }, [tenantId]);

  // load lines for current menu
  useEffect(() => {
    (async () => {
      if (!selectedMenuId) { setSel({}); setOverrides({}); return; }
      const { data: rows } = await supabase
        .from("menu_recipes")
        .select("recipe_id, servings, price")
        .eq("menu_id", selectedMenuId);
      const nextSel: Sel = {};
      const nextOv: Overrides = {};
      (rows ?? []).forEach((r: any) => {
        nextSel[r.recipe_id] = 1;
        const p = Number(r.price);
        if (!Number.isNaN(p) && p > 0) nextOv[r.recipe_id] = p;
      });
      setSel(nextSel);
      setOverrides(nextOv);
    })();
  }, [selectedMenuId]);

  // pricing helpers
  const costIndex = useMemo(
    () => buildRecipeCostIndex(recipes, ingredients, itemCostById),
    [recipes, ingredients, itemCostById]
  );

  function addRecipe(id: string) { setSel(s => ({ ...s, [id]: 1 })); }
  function removeRecipe(id: string) {
    setSel(s => { const c = { ...s }; delete c[id]; return c; });
    setOverrides(o => { const c = { ...o }; delete c[id]; return c; });
  }
  function setOverride(id: string, n: number) {
    setOverrides(o => ({ ...o, [id]: Math.max(0, n) }));
  }

  // persistence (keeps per-portion overrides)
  async function saveCurrentMenu() {
    try {
      if (!selectedMenuId) { alert("No menu selected"); return; }
      setBusy(true);
      const rows = Object.keys(sel).map(recipe_id => ({
        menu_id: selectedMenuId!,
        recipe_id,
        servings: 1,
        price: overrides[recipe_id] ?? 0,
      }));
      if (rows.length) {
        const { error } = await supabase
          .from("menu_recipes")
          .upsert(rows, { onConflict: "menu_id,recipe_id" });
        if (error) throw error;
      } else {
        await supabase.from("menu_recipes").delete().eq("menu_id", selectedMenuId!);
      }
      setStatus("Menu saved.");
    } catch (e: any) {
      alert(e.message ?? "Error saving menu");
    } finally { setBusy(false); }
  }

  async function createNewMenu() {
    try {
      if (!tenantId) return;
      setBusy(true);
      const name = window.prompt("Menu name:", "New Menu");
      if (!name) return;
      const { data: ins, error } = await supabase
        .from("menus")
        .insert({ tenant_id: tenantId, name })
        .select("id,name,created_at")
        .single();
      if (error) throw error;
      setMenus(m => [{ id: ins!.id, name: ins!.name, created_at: ins!.created_at }, ...m]);
      setSelectedMenuId(ins!.id);
      setSel({});
      setOverrides({});
      setStatus("Menu created.");
    } catch (e: any) {
      alert(e.message ?? "Error creating menu");
    } finally { setBusy(false); }
  }

  async function saveAsMenu() {
    try {
      if (!tenantId) return;
      const entries = Object.keys(sel);
      if (entries.length === 0) { alert("Add at least one recipe."); return; }
      setBusy(true);
      const defaultName = `Menu ${new Date().toLocaleDateString()}`;
      const name = window.prompt("New menu name:", defaultName);
      if (!name) return;
      const { data: m, error: mErr } = await supabase
        .from("menus")
        .insert({ tenant_id: tenantId, name })
        .select("id,name,created_at")
        .single();
      if (mErr) throw mErr;
      const newId = m!.id as string;
      const rows = entries.map(recipe_id => ({
        menu_id: newId,
        recipe_id,
        servings: 1,
        price: overrides[recipe_id] ?? 0,
      }));
      const { error: rErr } = await supabase
        .from("menu_recipes")
        .upsert(rows, { onConflict: "menu_id,recipe_id" });
      if (rErr) throw rErr;
      setMenus(ms => [{ id: newId, name: m!.name, created_at: m!.created_at }, ...ms]);
      setSelectedMenuId(newId);
      setStatus("Menu saved.");
    } catch (e: any) {
      alert(e.message ?? "Error saving as new menu");
    } finally { setBusy(false); }
  }

  async function deleteCurrentMenu() {
    try {
      if (!selectedMenuId || !confirm("Delete this menu?")) return;
      setBusy(true);
      await supabase.from("menus").delete().eq("id", selectedMenuId);
      setMenus(ms => ms.filter(m => m.id !== selectedMenuId));
      setSelectedMenuId(null);
      setSel({});
      setOverrides({});
      setStatus("Menu deleted.");
    } catch (e: any) {
      alert(e.message ?? "Error deleting menu");
    } finally { setBusy(false); }
  }

  // ✅ SAME TAB navigation to the share page
  function openShare() {
    if (!selectedMenuId) { alert("No menu selected"); return; }
    const pct = Math.round(margin * 100);
    router.push(
      `/menu/share?menu_id=${encodeURIComponent(selectedMenuId)}&margin=${pct / 100}`
    );
  }

  // lookups
  const ingByRecipe = useMemo(() => {
    const map = new Map<string, IngredientLine[]>();
    for (const ing of ingredients) {
      if (!ing.recipe_id) continue;
      if (!map.has(ing.recipe_id)) map.set(ing.recipe_id, []);
      map.get(ing.recipe_id)!.push(ing);
    }
    return map;
  }, [ingredients]);

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Menu</h1>
      {status && <p className="text-xs text-emerald-400">{status}</p>}

      {/* Top controls */}
      <div className="flex flex-wrap items-center gap-2">
        <form onSubmit={(e) => e.preventDefault()} className="flex items-center gap-2">
          <label className="text-sm">Saved menus:</label>
          <select
            className="border rounded-md px-2 py-2 bg-neutral-950 text-neutral-100"
            value={selectedMenuId ?? ""}
            onChange={(e) => setSelectedMenuId(e.target.value || null)}
          >
            {(menus ?? []).map(m => (
              <option key={m.id} value={m.id}>
                {(m.name || "Untitled")}
                {m.created_at ? ` • ${new Date(m.created_at).toLocaleDateString()}` : ""}
              </option>
            ))}
            {(!menus || menus.length === 0) && <option value="">(no menus yet)</option>}
          </select>
          <button className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">Load</button>
        </form>

        <button disabled={busy} onClick={createNewMenu}
                className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">New Menu</button>
        <button disabled={busy} onClick={saveCurrentMenu}
                className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">Save</button>
        <button disabled={busy} onClick={saveAsMenu}
                className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">Save as</button>
        <button disabled={busy} onClick={deleteCurrentMenu}
                className="px-3 py-2 border rounded-md text-sm hover:bg-red-950">Delete</button>

        {/* opens /menu/share in same tab */}
        <button onClick={openShare}
                className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">Share</button>
      </div>

      {/* Margin + rounding */}
      <div className="flex items-center gap-3">
        <label className="text-sm">Margin:</label>
        <input
          type="range"
          min={5}
          max={95}
          value={Math.round(margin * 100)}
          onChange={(e) => setMargin(Number(e.target.value) / 100)}
        />
        <span className="text-sm">{Math.round(margin * 100)}%</span>
        <span className="text-xs opacity-70">(affects suggested selling price)</span>

        <div className="ml-6 flex items-center gap-2">
          <span className="text-sm">Round to:</span>
          <select
            className="border rounded-md px-2 py-1 bg-neutral-950 text-neutral-100"
            value={ending}
            onChange={(e) => setEnding(e.target.value as RoundEnding)}
          >
            <option value=".00">.00</option>
            <option value=".49">.49</option>
            <option value=".79">.79</option>
            <option value=".89">.89</option>
            <option value=".95">.95</option>
            <option value=".99">.99</option>
          </select>
        </div>
      </div>

      {/* Two panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Pick list */}
        <div className="border rounded p-4">
          <div className="font-semibold mb-2">Pick recipes</div>
          <div className="space-y-2 max-h-[60vh] overflow-auto pr-2">
            {recipes.map(r => (
              <div key={r.id} className="flex items-center justify-between gap-2 text-sm">
                <span>{r.name}</span>
                {sel[r.id] ? (
                  <button className="text-xs underline" onClick={() => removeRecipe(r.id)}>Remove</button>
                ) : (
                  <button className="text-xs underline" onClick={() => addRecipe(r.id)}>Add</button>
                )}
              </div>
            ))}
            {recipes.length === 0 && <div className="text-sm text-neutral-400">No recipes yet.</div>}
          </div>
        </div>

        {/* Menu items (suggested price only) */}
        <div className="border rounded p-4">
          <div className="font-semibold mb-2">Menu items</div>
          <div className="grid grid-cols-[1fr_180px] gap-3 text-xs uppercase opacity-70 mb-2">
            <div>Item</div>
            <div className="text-right">Suggested price</div>
          </div>
          {Object.keys(sel).length === 0 ? (
            <p className="text-sm text-neutral-400">Add recipes on the left.</p>
          ) : (
            <div className="space-y-3">
              {Object.keys(sel)
                .map(id => ({ id, name: recipes.find(r => r.id === id)?.name || "Untitled" }))
                .sort((a, b) => a.name.localeCompare(b.name))
                .map(row => {
                  const costEach = costIndex[row.id] ?? 0;
                  const suggestedBase = applyEnding(costEach / (margin || 0.3), ending);
                  const ov = Number(overrides[row.id]);
                  const unitPrice = ov > 0 ? ov : suggestedBase;
                  return (
                    <div key={row.id} className="grid grid-cols-[1fr_180px] gap-3 items-center">
                      <div>
                        <div className="font-medium text-sm">{row.name}</div>
                        <div className="text-xs opacity-70">{fmtUSD(costEach)} each (raw cost)</div>
                      </div>
                      <div className="relative">
                        <span className="absolute left-2 top-1.5 text-xs opacity-70">$</span>
                        <input
                          className="border rounded pl-4 pr-2 p-1 text-right w-[180px] tabular-nums"
                          type="number"
                          min={0}
                          step="0.01"
                          value={Number(unitPrice).toFixed(2)}
                          onChange={(e) => setOverride(row.id, Number(e.target.value))}
                        />
                      </div>
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
