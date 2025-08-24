// src/app/recipes/[id]/duplicate/route.ts
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = await createServerClient();

  // Auth → tenant
  const { data: u } = await supabase.auth.getUser();
  const userId = u.user?.id;
  if (!userId) {
    return NextResponse.redirect(new URL("/login?redirect=/recipes", _req.url));
  }
  const { data: prof, error: pErr } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", userId)
    .maybeSingle();
  if (pErr || !prof?.tenant_id) {
    return NextResponse.redirect(new URL("/recipes", _req.url));
  }
  const tenantId = prof.tenant_id as string;
  const recipeId = params.id;

  // Load original
  const { data: r, error: rErr } = await supabase
    .from("recipes")
    .select(
      "id,tenant_id,name,category,batch_yield_qty,batch_yield_unit,yield_pct,labor_mins,description,menu_description"
    )
    .eq("id", recipeId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (rErr || !r) {
    return NextResponse.redirect(new URL("/recipes", _req.url));
  }

  // Insert copy
  const copyName = `${r.name ?? "Untitled"} (copy)`;
  const { data: inserted, error: iErr } = await supabase
    .from("recipes")
    .insert({
      tenant_id: tenantId,
      name: copyName,
      category: r.category,
      batch_yield_qty: r.batch_yield_qty,
      batch_yield_unit: r.batch_yield_unit,
      yield_pct: r.yield_pct,
      labor_mins: r.labor_mins,
      description: r.description,
      menu_description: r.menu_description,
    })
    .select("id")
    .single();
  if (iErr || !inserted?.id) {
    return NextResponse.redirect(new URL("/recipes", _req.url));
  }
  const newId = inserted.id as string;

  // Copy ingredients
  const { data: lines, error: lErr } = await supabase
    .from("recipe_ingredients")
    .select("item_id,sub_recipe_id,qty,unit")
    .eq("recipe_id", recipeId);
  if (!lErr && (lines ?? []).length) {
    const payload = (lines ?? []).map((ln) => ({
      recipe_id: newId,
      item_id: ln.item_id,
      sub_recipe_id: ln.sub_recipe_id,
      qty: ln.qty,
      unit: ln.unit,
    }));
    await supabase.from("recipe_ingredients").insert(payload);
  }

  // Redirect straight into Edit
  return NextResponse.redirect(new URL(`/recipes/${newId}/edit`, _req.url));
}
