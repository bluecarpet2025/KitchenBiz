import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function POST(_req: Request, ctx: any) {
  const supabase = await createServerClient();

  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  if (!uid) {
    return NextResponse.json({ ok: false, error: "auth" }, { status: 401 });
  }

  const { data: prof } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", uid)
    .maybeSingle();

  const tenantId = prof?.tenant_id;
  if (!tenantId) {
    return NextResponse.json({ ok: false, error: "no-tenant" }, { status: 400 });
  }

  const id = ctx?.params?.id as string | undefined;
  if (!id) {
    return NextResponse.json({ ok: false, error: "missing id" }, { status: 400 });
  }

  const { error } = await supabase
    .from("inventory_items")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", tenantId);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
