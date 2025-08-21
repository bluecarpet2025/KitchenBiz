// src/components/MenuPageClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  costPerBaseUnit,
  costPerServing,
  suggestedPrice,
  fmtUSD,
  type IngredientLine,
  type RecipeLike,
} from "@/lib/costing";

type MenuRow = { id: string; name: string | null; created_at: string | null };
type RecipeRow = RecipeLike & {
  id: string;
  name: string | null;
  batch_yield_unit: string | null;
};
type Sel = Record<string, number>; // recipeId -> portions

export default function MenuPageClient() {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [menus, setMenus] = useState<MenuRow[]>([]);
  const [selectedMenuId, setSelectedMenuId] = useState<string | null>(null);
  const [recipes, setRecipes] = useState<RecipeRow[]>([]);
  const [sel, setSel] = useState<Sel>({});
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(null);

  // pricing maps for currently selected items (recipeId -> priceEach)
  const [priceByRecipeId, setPriceByRecipeId] = useState<Record<string, number>>(
    {}
  );
  const DEFAULT_MARGIN = 30;

  // boot: get tenant, menus, recipes
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
      if (!prof?.tenant_id) {
        setStatus("No tenant.");
        return;
      }
      setTenantId(prof.tenant_id);

      const { data: ms } = await supabase
        .from("menus")
        .select("id,name,created_at")
        .eq("tenant_id", prof.tenant_id)
        .order("created_at", { ascending: false });
      const list = (ms ?? []) as MenuRow[];
      setMenus(list);
      setSelectedMenuId(list?.[0]?.id ?? null);

      const { data: recs } = await supabase
        .from("recipes")
        .select("id,name,batch_yield_qty,batch_yield_unit,yield_pct")
        .eq("tenant_id", prof.tenant_id)
        .order("name");
      setRecipes((recs ?? []) as RecipeRow[]);
    })();
  }, []);

  // when a menu is selected, load its lines + any share
  useEffect(() => {
    (async () => {
      if (!selectedMenuId) {
        setSel({});
        setShareToken(null);
        setPriceByRecipeId({});
        return;
      }
      const { data: rows } = await supabase
        .from("menu_recipes")
        .select("recipe_id, servings")
        .eq("menu_id", selectedMenuId);

      const next: Sel = {};
      (rows ?? []).forEach((r: any) => {
        next[r.recipe_id] = Number(r.servings || 1);
      });
      setSel(next);

      const { data: shares } = await supabase
        .from("menu_shares")
        .select("token")
        .eq("menu_id", selectedMenuId)
        .limit(1);
      setShareToken(shares?.[0]?.token ?? null);
    })();
  }, [selectedMenuId]);

  // recompute pricing for the current selection
  useEffect(() => {
    (async () => {
      if (!tenantId) return;
      const recipeIds = Object.keys(sel).filter((k) => sel[k] > 0);
      if (!recipeIds.length) {
        setPriceByRecipeId({});
        return;
      }

      // ingredients for chosen recipes
      const { data: ing } = await supabase
        .from("recipe_ingredients")
        .select("recipe_id,item_id,qty")
        .in("recipe_id", recipeIds);
      const ingRows =
        (ing ?? []) as { recipe_id: string; item_id: string; qty: number | null }[];

      // items
      const itemIds = Array.from(new Set(ingRows.map((r) => r.item_id)));
      type ItemRow = {
        id: string;
        last_price: number | null;
        pack_to_base_factor: number | null;
      };
      let itemRows: ItemRow[] = [];
      if (itemIds.length) {
        const { data: its } = await supabase
          .from("inventory_items")
          .select("id,last_price,pack_to_base_factor")
          .in("id", itemIds)
          .eq("tenant_id", tenantId);
        itemRows = (its ?? []) as ItemRow[];
      }

      const unitCostByItemId: Record<string, number> = {};
      itemRows.forEach((it) => {
        unitCostByItemId[it.id] = costPerBaseUnit(
          it.last_price,
          it.pack_to_base_factor
        );
      });

      // group ingredients
      const ingByRecipe = new Map<string, IngredientLine[]>();
      for (const row of ingRows) {
        if (!ingByRecipe.has(row.recipe_id)) ingByRecipe.set(row.recipe_id, []);
        ingByRecipe.get(row.recipe_id)!.push({
          item_id: row.item_id,
          qty: row.qty,
        });
      }

      const nextPrices: Record<string, number> = {};
      for (const rid of recipeIds) {
        const rec = recipes.find((r) => r.id === rid);
        if (!rec) continue;
        const ings = ingByRecipe.get(rid) ?? [];
        const cps = costPerServing({
          recipe: rec,
          ingredients: ings,
          itemCostById: unitCostByItemId,
        });
        nextPrices[rid] = suggestedPrice(cps, DEFAULT_MARGIN);
      }
      setPriceByRecipeId(nextPrices);
    })();
  }, [sel, tenantId, recipes]);

  function addRecipe(id: string) {
    setSel((s) => ({ ...s, [id]: s[id] ?? 1 }));
  }
  function removeRecipe(id: string) {
    setSel((s) => {
      const c = { ...s };
      delete c[id];
      return c;
    });
  }
  function setQty(id: string, n: number) {
    setSel((s) => ({ ...s, [id]: Math.max(0, Math.floor(n)) }));
  }

  // New menu
  async function createNewMenu() {
    try {
      if (!tenantId) return;
      setBusy(true);
      const name = window.prompt("Menu name:", "New Menu");
      if (!name) return;

      const { data: ins, error } = await supabase
        .from("menus")
        .insert({ tenant_id: tenantId, name })
        .select("id, name, created_at")
        .single();
      if (error) throw error;

      setMenus((m) => [
        { id: ins!.id, name: ins!.name, created_at: ins!.created_at },
        ...m,
      ]);
      setSelectedMenuId(ins!.id);
      setSel({});
      setShareToken(null);
      setStatus("Menu created.");
    } catch (err: any) {
      alert(err.message ?? "Error creating menu");
    } finally {
      setBusy(false);
    }
  }

  // Save current (UPSERT lines)
  async function saveCurrentMenu() {
    try {
      if (!selectedMenuId) {
        alert("No menu selected");
        return;
      }
      setBusy(true);

      const entries = Object.entries(sel)
        .filter(([, v]) => v > 0)
        .reduce(
          (acc, [rid, servings]) => (acc.set(rid, servings), acc),
          new Map<string, number>()
        );

      const rows = Array.from(entries.entries()).map(
        ([recipe_id, servings]) => ({
          menu_id: selectedMenuId!,
          recipe_id,
          servings: Number(servings),
          price: 0,
        })
      );

      if (rows.length) {
        const { error } = await supabase
          .from("menu_recipes")
          .upsert(rows, { onConflict: "menu_id,recipe_id" });
        if (error) throw error;
      } else {
        await supabase
          .from("menu_recipes")
          .delete()
          .eq("menu_id", selectedMenuId!);
      }

      setStatus("Menu saved.");
      if (tenantId) {
        const { data: ms } = await supabase
          .from("menus")
          .select("id,name,created_at")
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false });
        setMenus((ms ?? []) as MenuRow[]);
      }
    } catch (err: any) {
      alert(err.message ?? "Error saving menu");
    } finally {
      setBusy(false);
    }
  }

  // Save as (clone)
  async function saveAsMenu() {
    try {
      if (!tenantId) return;
      const entries = Object.entries(sel).filter(([, v]) => v > 0);
      if (entries.length === 0) {
        alert("Add at least one recipe.");
        return;
      }

      setBusy(true);
      const defaultName = `Menu ${new Date().toLocaleDateString()}`;
      const name = window.prompt("New menu name:", defaultName);
      if (!name) return;

      const { data: m, error: mErr } = await supabase
        .from("menus")
        .insert({ tenant_id: tenantId, name })
        .select("id, name, created_at")
        .single();
      if (mErr) throw mErr;

      const newId = m!.id as string;
      const rows = entries.map(([recipe_id, servings]) => ({
        menu_id: newId,
        recipe_id,
        servings: Number(servings),
        price: 0,
      }));

      const { error: rErr } = await supabase
        .from("menu_recipes")
        .upsert(rows, { onConflict: "menu_id,recipe_id" });
      if (rErr) throw rErr;

      setMenus((ms) => [
        { id: newId, name: m!.name, created_at: m!.created_at },
        ...ms,
      ]);
      setSelectedMenuId(newId);
      setShareToken(null);
      setStatus("Menu saved.");
    } catch (err: any) {
      alert(err.message ?? "Error saving as new menu");
    } finally {
      setBusy(false);
    }
  }

  function doPrint() {
    if (!selectedMenuId) {
      alert("No menu selected");
      return;
    }
    window.open(`/menu/print?menu_id=${selectedMenuId}`, "_blank");
  }

  async function createShare() {
    try {
      if (!selectedMenuId || !tenantId) return;
      setBusy(true);

      const name =
        menus.find((m) => m.id === selectedMenuId)?.name ?? "Menu";
      const items = Object.keys(sel)
        .filter((id) => sel[id] > 0)
        .map((id) => ({
          name: recipes.find((r) => r.id === id)?.name || "Untitled",
          servings: sel[id],
        }));

      const token = crypto.randomUUID().replace(/-/g, "").slice(0, 24);
      const payload = {
        name,
        created_at: new Date().toISOString(),
        items,
      };

      const { error } = await supabase.from("menu_shares").insert({
        token,
        tenant_id: tenantId,
        menu_id: selectedMenuId,
        payload,
      });
      if (error) throw error;

      setShareToken(token);

      const origin =
        typeof window !== "undefined"
          ? window.location.origin
          : "https://kitchenbiz.vercel.app";

      await navigator.clipboard
        .writeText(`${origin}/share/${token}`)
        .catch(() => {});

      setStatus("Public share link created & copied.");
    } catch (err: any) {
      alert(err.message ?? "Error creating share link");
    } finally {
      setBusy(false);
    }
  }

  const selectedList = useMemo(
    () =>
      Object.keys(sel)
        .map((id) => ({
          id,
          servings: sel[id],
          name: recipes.find((r) => r.id === id)?.name || "Untitled",
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [sel, recipes]
  );

  const total = selectedList.reduce(
    (acc, r) => acc + (priceByRecipeId[r.id] ?? 0) * (r.servings ?? 0),
    0
  );

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Menu</h1>
      {status && <p className="text-xs text-emerald-400">{status}</p>}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <form
            onSubmit={(e) => e.preventDefault()}
            className="flex items-center gap-2"
          >
            <label className="text-sm">Saved menus:</label>
            <select
              className="border rounded-md px-2 py-2 bg-neutral-950 text-neutral-100"
              value={selectedMenuId ?? ""}
              onChange={(e) => setSelectedMenuId(e.target.value || null)}
            >
              {(menus ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {(m.name || "Untitled")}
                  {m.created_at
                    ? ` • ${new Date(m.created_at).toLocaleDateString()}`
                    : ""}
                </option>
              ))}
              {(!menus || menus.length === 0) && (
                <option value="">(no menus yet)</option>
              )}
            </select>
            <button className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
              Load
            </button>
          </form>

          <button
            disabled={busy}
            onClick={createNewMenu}
            className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
          >
            New Menu
          </button>
          <button
            disabled={busy}
            onClick={saveCurrentMenu}
            className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
          >
            Save
          </button>
          <button
            disabled={busy}
            onClick={saveAsMenu}
            className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
          >
            Save as
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={doPrint}
            className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
          >
            Print
          </button>
          {!shareToken ? (
            <button
              disabled={busy}
              onClick={createShare}
              className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
            >
              Create share link
            </button>
          ) : (
            <button
              onClick={async () => {
                const origin =
                  typeof window !== "undefined"
                    ? window.location.origin
                    : "https://kitchenbiz.vercel.app";
                await navigator.clipboard
                  .writeText(`${origin}/share/${shareToken}`)
                  .catch(() => {});
                setStatus("Share link copied.");
              }}
              className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
            >
              Copy share
            </button>
          )}
        </div>
      </div>

      {/* Two panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Pick list */}
        <div className="border rounded p-4">
          <div className="font-semibold mb-2">Pick recipes</div>
          <div className="space-y-2 max-h-[60vh] overflow-auto pr-2">
            {recipes.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span>{r.name}</span>
                {sel[r.id] ? (
                  <button
                    className="text-xs underline"
                    onClick={() => removeRecipe(r.id)}
                  >
                    Remove
                  </button>
                ) : (
                  <button
                    className="text-xs underline"
                    onClick={() => addRecipe(r.id)}
                  >
                    Add
                  </button>
                )}
              </div>
            ))}
            {recipes.length === 0 && (
              <div className="text-sm text-neutral-400">No recipes yet.</div>
            )}
          </div>
        </div>

        {/* Quantities + price */}
        <div className="border rounded p-4">
          <div className="font-semibold mb-2">Quantities (portions)</div>
          {selectedList.length === 0 ? (
            <p className="text-sm text-neutral-400">Add recipes on the left.</p>
          ) : (
            <div className="space-y-2">
              {selectedList.map((row) => {
                const priceEach = priceByRecipeId[row.id] ?? 0;
                const line = priceEach * (row.servings ?? 0);
                return (
                  <div
                    key={row.id}
                    className="grid grid-cols-6 gap-2 items-center"
                  >
                    <div className="col-span-4">
                      <div className="font-medium">{row.name}</div>
                      <div className="text-xs opacity-70">
                        {fmtUSD(priceEach)} each
                      </div>
                    </div>
                    <input
                      className="border rounded p-1 col-span-1 text-right"
                      type="number"
                      min={0}
                      step={1}
                      value={sel[row.id]}
                      onChange={(e) =>
                        setQty(row.id, Number(e.target.value))
                      }
                    />
                    <div className="col-span-1 text-right tabular-nums">
                      {fmtUSD(line)}
                    </div>
                  </div>
                );
              })}
              <div className="flex justify-end pt-2 border-t mt-2">
                <div className="text-sm font-semibold">
                  Total: {fmtUSD(total)}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
