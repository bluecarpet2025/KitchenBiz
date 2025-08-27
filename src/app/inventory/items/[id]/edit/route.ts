// src/app/inventory/items/[id]/edit/route.ts
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

function toNum(n: FormDataEntryValue | null, def = 0): number {
  if (n == null) return def;
  const s = String(n).replace(/,/g, "").trim();
  if (s === "") return def;
  const v = Number(s);
  return Number.isFinite(v) ? v : def;
}
function toStr(v: FormDataEntryValue | null): string | null {
  const s = (v == null ? "" : String(v)).trim();
  return s === "" ? null : s;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createServerClient();

  // auth
  const { data: u } = await supabase.auth.getUser();
  const user = u.user ?? null;
  if (!user) {
    return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  }

  // tenant
  const { data: prof } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  const tenantId = prof?.tenant_id ?? null;
  if (!tenantId) {
    return NextResponse.json({ ok: false, error: "no_tenant" }, { status: 400 });
  }

  const form = await req.formData();

  const updates = {
    name: toStr(form.get("name")),
    base_unit: toStr(form.get("base_unit")),
    purchase_unit: toStr(form.get("purchase_unit")),
    pack_size_desc: toStr(form.get("pack_size_desc")),
    pack_to_base_factor: toNum(form.get("pack_to_base_factor"), 0),
    par_level: toNum(form.get("par_level"), 0),
    sku: toStr(form.get("sku")),
  };

  const { error } = await supabase
    .from("inventory_items")
    .update(updates)
    .eq("id", id)
    .eq("tenant_id", tenantId);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  // back to Manage items
  return NextResponse.redirect(new URL("/inventory/manage", req.url), 303);
}
