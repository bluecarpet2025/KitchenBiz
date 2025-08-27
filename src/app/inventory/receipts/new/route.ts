// src/app/inventory/receipts/new/route.ts
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await createServerClient();
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  if (!uid) return NextResponse.json({ ok:false, error:"auth" }, { status:401 });

  const body = await req.json().catch(() => ({}));
  const { item_id, qty_base, total_cost_usd, expires_on, note } = body || {};

  if (!item_id || !qty_base || qty_base <= 0 || total_cost_usd == null || total_cost_usd < 0) {
    return NextResponse.json({ ok:false, error:"Invalid payload" }, { status:400 });
  }

  const { data: prof } = await supabase
    .from("profiles").select("tenant_id").eq("id", uid).maybeSingle();
  const tenantId = prof?.tenant_id;
  if (!tenantId) return NextResponse.json({ ok:false, error:"no-tenant" }, { status:400 });

  const { error } = await supabase.from("inventory_receipts").insert({
    tenant_id: tenantId,
    item_id,
    qty_base: Number(qty_base),
    total_cost_usd: Number(total_cost_usd),
    expires_on: expires_on ? String(expires_on) : null,
    note: note || null,
  });

  if (error) return NextResponse.json({ ok:false, error: error.message }, { status:400 });
  return NextResponse.json({ ok:true });
}
