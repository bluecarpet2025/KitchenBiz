import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

type Row = {
  item_name: string;
  qty: number;
  unit: string;
  total_cost_usd: number;
  expires_on: string | null;
  note: string | null;
};

export async function POST(req: Request) {
  const { rows } = await req.json() as { rows: Row[] };
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "No rows" }, { status: 400 });
  }

  const supabase = await createServerClient();
  const { data: u } = await supabase.auth.getUser();
  const user = u.user;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: prof } = await supabase.from("profiles")
    .select("tenant_id").eq("id", user.id).maybeSingle();
  const tenantId = prof?.tenant_id;
  if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  let inserted = 0;
  for (const r of rows) {
    const name = (r.item_name ?? "").trim();
    if (!name) continue;

    // Find or create the item by name for this tenant
    let { data: item } = await supabase
      .from("inventory_items")
      .select("id, base_unit, purchase_unit, pack_to_base_factor")
      .eq("tenant_id", tenantId).ilike("name", name).maybeSingle();

    if (!item) {
      const { data: created, error: cErr } = await supabase.from("inventory_items").insert({
        tenant_id: tenantId,
        name,
        base_unit: "each",
        purchase_unit: "each",
        pack_to_base_factor: 1,
      }).select("id, base_unit, purchase_unit, pack_to_base_factor").single();
      if (cErr) return NextResponse.json({ error: cErr.message }, { status: 400 });
      item = created!;
    }

    const qty = Number(r.qty || 0);
    const cost = Number(r.total_cost_usd || 0);
    const unit = (r.unit ?? "").trim();

    // Convert to base units
    let qty_base = qty;
    if (unit && item) {
      if (unit === item.base_unit) {
        qty_base = qty;
      } else if (unit === item.purchase_unit) {
        qty_base = qty * Number(item.pack_to_base_factor || 1);
      }
    }

    const expires_on = r.expires_on ? new Date(r.expires_on).toISOString().slice(0,10) : null;

    const { error: insErr } = await supabase.from("inventory_receipts").insert({
      tenant_id: tenantId,
      item_id: item.id,
      qty_base,
      total_cost_usd: cost,
      expires_on,
      note: r.note ?? null,
    });

    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 });
    inserted++;
  }

  return NextResponse.json({ ok: true, inserted });
}
