import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

/**
 * POST body:
 * { rows: [{ item_name, qty, unit, total_cost_usd, expires_on, note }] }
 */
export async function POST(req: Request) {
  try {
    const { rows } = await req.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ ok: false, error: "No rows" }, { status: 400 });
    }

    const supabase = await createServerClient();
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id;
    if (!uid) return NextResponse.json({ ok: false, error: "Auth required" }, { status: 401 });

    const { data: prof } = await supabase
      .from("profiles").select("tenant_id").eq("id", uid).maybeSingle();
    const tenantId = prof?.tenant_id;
    if (!tenantId) return NextResponse.json({ ok: false, error: "No tenant" }, { status: 400 });

    // Get all names -> item records for this tenant
    const names = [...new Set(rows.map((r: any) => (r.item_name || "").trim()))].filter(Boolean);
    const { data: items } = await supabase
      .from("inventory_items")
      .select("id,name,base_unit,purchase_unit,pack_to_base_factor")
      .eq("tenant_id", tenantId)
      .in("name", names);

    const byName = new Map<string, any>();
    (items ?? []).forEach(it => byName.set(it.name, it));

    // Build payload for receipts
    const payload: any[] = [];
    for (const r of rows) {
      const it = byName.get(r.item_name);
      if (!it) {
        return NextResponse.json({ ok: false, error: `Unknown item: ${r.item_name}` }, { status: 400 });
      }
      const qty = Number(r.qty || 0);
      const pack = Number(it.pack_to_base_factor || 0);
      let qty_base = qty;

      const unit = String(r.unit || "").trim();
      if (unit && it.base_unit && unit === it.base_unit) {
        qty_base = qty;
      } else if (unit && it.purchase_unit && unit === it.purchase_unit) {
        qty_base = qty * (pack || 0);
      } else {
        // if unit empty we assume base units
        if (unit) {
          return NextResponse.json({ ok: false, error: `Unit mismatch for ${r.item_name}` }, { status: 400 });
        }
      }

      payload.push({
        tenant_id: tenantId,
        item_id: it.id,
        qty_base,
        total_cost_usd: Number(r.total_cost_usd || 0),
        expires_on: r.expires_on ? String(r.expires_on) : null,
        note: r.note ? String(r.note) : null,
      });
    }

    if (payload.length === 0) {
      return NextResponse.json({ ok: false, error: "Nothing to insert" }, { status: 400 });
    }

    const { error } = await supabase.from("inventory_receipts").insert(payload);
    if (error) throw error;

    // trigger creates inventory_transactions rows automatically
    return NextResponse.json({ ok: true, inserted: payload.length });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Import failed" }, { status: 500 });
  }
}
