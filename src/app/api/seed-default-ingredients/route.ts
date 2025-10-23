// src/app/api/seed-default-ingredients/route.ts
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { DEFAULT_INGREDIENTS } from "@/lib/default_ingredients";

export async function POST() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  const tenantId = profile?.tenant_id;
  if (!tenantId) return new NextResponse("Missing tenant", { status: 400 });

  for (const ing of DEFAULT_INGREDIENTS) {
    await supabase
      .from("inventory_items")
      .insert({
        tenant_id: tenantId,
        name: ing.name,
        base_unit: ing.base_unit,
        purchase_unit: ing.purchase_unit,
        pack_to_base_factor: ing.pack_to_base_factor,
      })
      .select()
      .single();
  }

  return NextResponse.json({ ok: true, count: DEFAULT_INGREDIENTS.length });
}
