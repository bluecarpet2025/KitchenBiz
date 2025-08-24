// src/app/recipes/[id]/delete/route.ts
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

// Keep the 2nd arg loose for Next 15 typing
export async function POST(_req: Request, context: any) {
  const { params } = context as { params: { id: string } };
  const supabase = await createServerClient();

  // Auth → tenant
  const { data: u } = await supabase.auth.getUser();
  const userId = u.user?.id;
  if (!userId) return NextResponse.json({ ok: false, error: "not_signed_in" }, { status: 401 });

  const { data: prof, error: pErr } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", userId)
    .maybeSingle();
  if (pErr || !prof?.tenant_id)
    return NextResponse.json({ ok: false, error: "no_tenant" }, { status: 400 });

  const recipeId = params.id;

  // Delete recipe scoped to tenant (ingredients cascade by FK)
  const { error: delErr } = await supabase
    .from("recipes")
    .delete()
    .eq("id", recipeId)
    .eq("tenant_id", prof.tenant_id);

  if (delErr) return NextResponse.json({ ok: false, error: delErr.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
