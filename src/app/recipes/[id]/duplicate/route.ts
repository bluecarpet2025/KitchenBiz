// src/app/recipes/[id]/duplicate/route.ts
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function POST(req: Request, context: any) {
  const { params } = context as { params: { id: string } };
  const supabase = await createServerClient();

  // Auth → tenant
  const { data: u } = await supabase.auth.getUser();
  const userId = u.user?.id;
  if (!userId) {
    return NextResponse.redirect(new URL("/login?redirect=/recipes", req.url));
  }
  const { data: prof } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", userId)
    .maybeSingle();

  const tenantId = prof?.tenant_id as string | undefined;
  if (!tenantId) {
    return NextResponse.redirect(new URL("/recipes", req.url));
  }

  const recipeId = params.id;

  // Load original
  const { data: r } = await supabase
    .from("recipes")
    .select(
      "id,tenant_id,name,category,batch_yield_qty,batch_yield_unit,yield_pct,labor_mins,description,menu_description"
    )
    .eq("id", recipeId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!r) return NextResponse.redirect(new URL("/recipes", req.url));

  // Insert copy
  const copyName = `${r.name ?? "Untitled"} (copy)`;
  const { data: inserted } = await supabase
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

  const newId = inserted?.id as string | undefined;
  if (!newId) return NextResponse.redirect(new URL("/recipes", req.url));

  // Copy ingredients
  const { data: lines } = await supabase
    .from("recipe_ingredients")
    .select("item_id,sub_recipe_id,qty,unit")
    .eq("recipe_id", recipeId);

  if (lines?.length) {
    await supabase.from("recipe_ingredients").insert(
      lines.map((ln) => ({
        recipe_id: newId,
        item_id: ln.item_id,
        sub_recipe_id: ln.sub_recipe_id,
        qty: ln.qty,
        unit: ln.unit,
      }))
    );
  }

  // Redirect to edit with "copiedFrom" for the banner
  const url = new URL(`/recipes/${newId}/edit`, req.url);
  if (r.name) url.searchParams.set("copiedFrom", r.name);
  return NextResponse.redirect(url);
}
