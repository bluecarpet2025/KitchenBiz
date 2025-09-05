// src/app/inventory/items/create/route.ts
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export const runtime = "edge";

export async function POST(req: Request) {
  const supabase = await createServerClient();

  // auth
  const { data: au } = await supabase.auth.getUser();
  const user = au.user ?? null;
  if (!user) {
    return NextResponse.redirect(new URL("/login?redirect=/inventory/items/new", req.url), 303);
  }

  // tenant (personal — demo stays read-only elsewhere)
  const { data: prof, error: profErr } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .maybeSingle();
  if (profErr) return NextResponse.json({ ok: false, error: profErr.message }, { status: 400 });

  const tenantId = prof?.tenant_id ?? null;
  if (!tenantId) return NextResponse.json({ ok: false, error: "no_tenant" }, { status: 400 });

  // form
  const form = await req.formData();
  const name = String(form.get("name") || "").trim();
  const sku = (form.get("sku") as string | null)?.trim() || null;
  const base_unit = (form.get("base_unit") as string | null)?.trim() || null;
  const purchase_unit = (form.get("purchase_unit") as string | null)?.trim() || null;

  const p2bRaw = form.get("pack_to_base_factor");
  const parRaw = form.get("par_level");

  const pack_to_base_factor =
    p2bRaw != null && String(p2bRaw).trim() !== "" ? Number.parseInt(String(p2bRaw), 10) : null;
  const par_level =
    parRaw != null && String(parRaw).trim() !== "" ? Number(String(parRaw)) : null;

  if (!name) return NextResponse.json({ ok: false, error: "name_required" }, { status: 400 });
  if (pack_to_base_factor != null && (!Number.isFinite(pack_to_base_factor) || pack_to_base_factor < 0)) {
    return NextResponse.json({ ok: false, error: "invalid_pack_to_base_factor" }, { status: 400 });
  }
  if (par_level != null && !Number.isFinite(par_level)) {
    return NextResponse.json({ ok: false, error: "invalid_par_level" }, { status: 400 });
  }

  const { error: insertErr } = await supabase.from("inventory_items").insert({
    tenant_id: tenantId,
    name,
    base_unit,
    purchase_unit,
    pack_to_base_factor,
    sku,
    par_level,
  });
  if (insertErr) return NextResponse.json({ ok: false, error: insertErr.message }, { status: 400 });

  try {
    revalidatePath("/inventory");
    revalidatePath("/inventory/manage");
  } catch {}

  return NextResponse.redirect(new URL("/inventory/manage", req.url), 303);
}

// No GET here.
export async function GET() {
  return NextResponse.json({ ok: false, error: "method_not_allowed" }, { status: 405 });
}
