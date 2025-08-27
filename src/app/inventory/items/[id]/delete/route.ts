// src/app/inventory/items/[id]/delete/route.ts
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const supabase = await createServerClient();
  const { data: u } = await supabase.auth.getUser();
  const user = u.user;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: prof } = await supabase.from("profiles")
    .select("tenant_id").eq("id", user.id).maybeSingle();
  const tenantId = prof?.tenant_id;
  if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  const { error } = await supabase.from("inventory_items")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", params.id).eq("tenant_id", tenantId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
