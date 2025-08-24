// src/app/recipes/[id]/delete/route.ts
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

// Keep `context` loose to avoid Next 15 PageProps typing issues
export async function POST(_req: Request, context: any) {
  try {
    const { params } = context as { params: { id: string } };
    const recipeId = params.id;
    const supabase = await createServerClient();

    // Auth → tenant
    const { data: u } = await supabase.auth.getUser();
    const userId = u.user?.id;
    if (!userId) {
      return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
    }

    const { data: prof, error: pErr } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", userId)
      .maybeSingle();
    if (pErr) return NextResponse.json({ ok: false, error: pErr.message }, { status: 400 });

    const tenantId = prof?.tenant_id;
    if (!tenantId) {
      return NextResponse.json({ ok: false, error: "No tenant for user" }, { status: 400 });
    }

    // Ensure the recipe belongs to this tenant
    const { data: rec, error: rErr } = await supabase
      .from("recipes")
      .select("id")
      .eq("id", recipeId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (rErr) return NextResponse.json({ ok: false, error: rErr.message }, { status: 400 });
    if (!rec) return NextResponse.json({ ok: false, error: "Recipe not found" }, { status: 404 });

    // ---- Defensive cleanup (explicit) ----
    // menu_items has tenant_id; remove any rows referencing this recipe
    {
      const { error } = await supabase
        .from("menu_items")
        .delete()
        .eq("recipe_id", recipeId)
        .eq("tenant_id", tenantId);
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    // menu_recipes (no tenant_id column; FK ties to menus)
    {
      const { error } = await supabase
        .from("menu_recipes")
        .delete()
        .eq("recipe_id", recipeId);
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    // recipe_ingredients (no tenant_id; guarded by recipe FK/RLS)
    {
      const { error } = await supabase
        .from("recipe_ingredients")
        .delete()
        .eq("recipe_id", recipeId);
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    // Finally delete the recipe
    {
      const { error } = await supabase
        .from("recipes")
        .delete()
        .eq("id", recipeId)
        .eq("tenant_id", tenantId);
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const msg = typeof e?.message === "string" ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
