// src/components/MenuPageClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  fmtUSD,
  costPerBaseUnit,
  costPerPortion,
  priceFromCost,
  type ItemCostById,
  type RecipeLike,
  type IngredientLine,
} from "@/lib/costing";

type MenuRow = { id: string; name: string | null; created_at: string | null };
type RecipeRow = RecipeLike;
type Sel = Record<string, number>; // recipeId -> portions (kept for menu structure)
type Overrides = Record<string, number>; // recipeId -> manual price override
type RoundEnding = ".00" | ".49" | ".79" | ".89" | ".95" | ".99";

function applyEnding(n: number, ending: RoundEnding) {
  const whole = Math.floor(n);
  const cents = Number(ending.slice(1));
  return whole + cents / 100;
}

export default function MenuPageClient() {
  const [tenantId, setTenantId] = useState<string | null>(null);

  const [menus, setMenus] = useState<MenuRow[]>([]);
  const [selectedMenuId, setSelectedMenuId] = useState<string | null>(null);

  const [recipes, setRecipes] = useState<RecipeRow[]>([]);
  const [ingredients, setIngredients] = useState<IngredientLine[]>([]);
  const [itemCostById, setItemCostById] = useState<ItemCostById>({});

  const [sel, setSel] = useState<Sel>({});
  const [overrides, setOverrides] = useState<Overrides>({});
  const [margin, setMargin] = useState(0.3); // 30% default
  const [ending, setEnding] = useState<RoundEnding>(".99");

  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // boot: auth + tenant + lists
  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) {
        setStatus("Sign in required.");
        return;
      }

      const { data: prof } = await supabase
        .from("profiles")
        .select("tenant_id")
        .eq("id", uid)
        .maybeSingle();

      const tId = prof?.tenant_id ?? null;
      if (!tId) {
        setStatus("No tenant.");
        return;
      }
      setTenantId(tId);

      // Menus
      const { data: ms } = await supabase
        .from("menus")
        .select("id,name,created_at")
        .eq("tenant_id", tId)
        .order("created_at", { ascending: false });
      const list = (ms ?? []) as MenuRow[];
      setMenus(list);
      setSelectedMenuId(list?.[0]?.id ?? null);

      // Recipes
      const { data: recs } = await supabase
        .from("recipes")
        .select("id,name,batch_yield_qty,batch_yield_unit,yield_pct,menu_description")
        .eq("tenant_id", tId)
        .order("name");
      setRecipes((recs ?? []) as RecipeRow[]);

      // Ingredients
      const { data: ing } = await supabase.from("recipe_ingredients").select("recipe_id,item_id,qty");
      setIngredients((ing ?? []) as IngredientLine[]);

      // Inventory item costs
      const { data: items } = await supabase
        .from("inventory_items")
        .select("id,last_price,pack_to_base_factor")
        .eq("tenant_id", tId);

      const costMap: ItemCostById = {};
      (items ?? []).forEach((it: any) => {
        costMap[it.id] = costPerBaseUnit(Number(it.last_price ?? 0), Number(it.pack_to_base_factor ?? 0));
      });
      setItemCostById(costMap);
    })();
  }, []);

  // when a menu is selected, load its lines
  useEffect(() => {
    (async () => {
      if (!selectedMenuId) {
        setSel({});
        setOverrides({});
        return;
      }
      const { data: rows } = await supabase
        .from("menu_recipes")
        .select("recipe_id, price")
        .eq("menu_id", selectedMenuId);

      const next: Sel = {};
      const nextOv: Overrides = {};
      (rows ?? []).forEach((r: any) => {
        next[r.recipe_id] = 1; // keep minimal structure
        if (r.price != null && !Number.isNaN(Number(r.price))) {
          nextOv[r.recipe_id] = Number(r.price);
        }
      });
      setSel(next);
      setOverrides(nextOv);
    })();
  }, [selectedMenuId]);

  function addRecipe(id: string) {
    setSel((s) => ({ ...s, [id]: 1 }));
  }
  function removeRecipe(id: string) {
    setSel((s) => {
      const c = { ...s };
      delete c[id];
      return c;
    });
    setOverrides((o) => {
      const c = { ...o };
      delete c[id];
      return c;
    });
  }
  function setOverride(id: string, n: number) {
    setOverrides((o) => ({ ...o, [id]: Math.max(0, n) }));
  }

  // Save menu
  async function saveCurrentMenu() {
    try {
      if (!selectedMenuId) {
        alert("No menu selected");
        return;
      }
      setBusy(true);

      const rows = Object.keys(sel).map((recipe_id) => ({
        menu_id: selectedMenuId!,
        recipe_id,
        servings: 1,
        price: overrides[recipe_id] ?? 0,
      }));

      if (rows.length) {
        const { error } = await supabase.from("menu_recipes").upsert(rows, { onConflict: "menu_id,recipe_id" });
        if (error) throw error;
      } else {
        await supabase.from("menu_recipes").delete().eq("menu_id", selectedMenuId!);
      }

      setStatus("Menu saved.");
    } catch (err: any) {
      alert(err.message ?? "Error saving menu");
    } finally {
      setBusy(false);
    }
  }

  function openShare() {
    if (!selectedMenuId) {
      alert("No menu selected");
      return;
    }
    const pct = Math.round(margin * 100);
    window.open(`/menu/print?menu_id=${encodeURIComponent(selectedMenuId)}&margin=${pct / 100}`, "_blank");
  }

  // lookups
  const ingByRecipe = useMemo(() => {
    const map = new Map<string, IngredientLine[]>();
    for (const ing of ingredients) {
      if (!map.has(ing.recipe_id!)) map.set(ing.recipe_id!, []);
      map.get(ing.recipe_id!)!.push(ing);
    }
    return map;
  }, [ingredients]);

  const selectedList = useMemo(
    () =>
      Object.keys(sel)
        .map((id) => ({
          id,
          name: recipes.find((r) => r.id === id)?.name || "Untitled",
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [sel, recipes]
  );

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Menu</h1>
      {status && <p className="text-xs text-emerald-400">{status}</p>}

      {/* Actions */}
      <div className="flex items-center gap-2 flex-wrap">
        <button disabled={busy} onClick={saveCurrentMenu} className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
          Save
        </button>
        <button onClick={openShare} className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
          Share
        </button>
      </div>

      {/* margin + rounding */}
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
        <span className="text-xs opacity-70">(affects suggested price)</span>

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

      {/* Menu items */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="border rounded p-4">
          <div className="font-semibold mb-2">Pick recipes</div>
          <div className="space-y-2 max-h-[60vh] overflow-auto pr-2">
            {recipes.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 text-sm">
                <span>{r.name}</span>
                {sel[r.id] ? (
                  <button className="text-xs underline" onClick={() => removeRecipe(r.id)}>
                    Remove
                  </button>
                ) : (
                  <button className="text-xs underline" onClick={() => addRecipe(r.id)}>
                    Add
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="border rounded p-4">
          <div className="font-semibold mb-2">Menu items</div>
          <div className="grid grid-cols-[1fr_150px] gap-3 text-xs uppercase opacity-70 mb-2">
            <div>Item</div>
            <div className="text-right">Suggested Price</div>
          </div>

          {selectedList.length === 0 ? (
            <p className="text-sm text-neutral-400">Add recipes on the left.</p>
          ) : (
            <div className="space-y-3">
              {selectedList.map((row) => {
                const recipe = recipes.find((r) => r.id === row.id)!;
                const parts = ingByRecipe.get(row.id) ?? [];
                const costEach = costPerPortion(recipe, parts, itemCostById);
                const suggestedBase = applyEnding(priceFromCost(costEach, margin), ending);

                const override = overrides[row.id];
                const unitPrice = override != null ? override : suggestedBase;

                return (
                  <div key={row.id} className="grid grid-cols-[1fr_150px] gap-3 items-center">
                    <div>
                      <div className="font-medium text-sm">{row.name}</div>
                      <div className="text-xs opacity-70">{fmtUSD(costEach)} each (raw cost)</div>
                    </div>
                    <div className="relative">
                      <span className="absolute left-2 top-1.5 text-xs opacity-70">$</span>
                      <input
                        className="border rounded pl-4 pr-2 p-1 text-right w-[150px] tabular-nums"
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
