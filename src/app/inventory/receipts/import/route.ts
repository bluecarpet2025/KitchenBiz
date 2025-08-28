import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

type Row = {
  item_name: string;
  sku?: string | null;
  qty: number;
  unit: string; // base or purchase unit
  total_cost_usd: number;
  expires_on?: string | null; // yyyy-mm-dd
  note?: string | null;
};

function bad(msg: string, code = 400) {
  return NextResponse.json({ error: msg }, { status: code });
}

export async function POST(req: Request) {
  const supabase = await createServerClient();

  // auth
  const { data: au } = await supabase.auth.getUser();
  const user = au.user;
  if (!user) return bad("Not signed in", 401);

  // tenant
  const { data: prof, error: pErr } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .maybeSingle();
  if (pErr || !prof?.tenant_id) return bad("Profile/tenant not found", 401);
  const tenantId = prof.tenant_id as string;

  const body = await req.json().catch(() => null);
  const rows: Row[] = Array.isArray(body?.rows) ? body.rows : [];
  if (rows.length === 0) return bad("No rows provided");

  const warnings: string[] = [];
  let inserted = 0;

  for (const r of rows) {
    const name = String(r.item_name ?? "").trim();
    const unit = String(r.unit ?? "").trim().toLowerCase();
    const qty = Number(r.qty);
    const cost = Number(r.total_cost_usd);

    if (!name) return bad(`Missing item_name`);
    if (!Number.isFinite(qty) || qty <= 0)
      return bad(`Invalid qty for "${name}"`);
    if (!Number.isFinite(cost) || cost < 0)
      return bad(`Invalid total_cost_usd for "${name}"`);
    if (!unit) return bad(`Missing unit for "${name}"`);

    // Find item by (tenant, name) and disambiguate by unit (prefer base match), then SKU if provided
    const { data: candidates, error: iErr } = await supabase
      .from("inventory_items")
      .select(
        "id, name, base_unit, purchase_unit, pack_to_base_factor, sku"
      )
      .eq("tenant_id", tenantId)
      .ilike("name", name);

    if (iErr) return bad(iErr.message);

    if (!candidates || candidates.length === 0) {
      return bad(`Item not found: "${name}"`);
    }

    let item =
      candidates.find((c) => c.base_unit === unit) ??
      candidates.find((c) => c.purchase_unit === unit) ??
      null;

    // optional SKU disambiguation
    const sku = (r.sku ?? "").toString().trim();
    if (sku && candidates.length > 1) {
      const bySku = candidates.find((c) => (c.sku ?? "") === sku);
      if (bySku) item = bySku;
    }

    if (!item) {
      return bad(
        `Unit "${unit}" doesn’t match the item "${name}" (base=${candidates[0].base_unit}, purchase=${candidates[0].purchase_unit})`
      );
    }

    const factor =
      item.purchase_unit === unit
        ? Number(item.pack_to_base_factor ?? 0)
        : 1;

    if (!Number.isFinite(factor) || factor <= 0) {
      return bad(
        `Invalid pack_to_base_factor for "${name}" when using purchase unit`
      );
    }

    const qty_base = qty * factor;

    // Insert receipt → trigger writes a matching inflow transaction
    const { error: rErr } = await supabase.from("inventory_receipts").insert({
      tenant_id: tenantId,
      item_id: item.id,
      qty_base,
      total_cost_usd: cost,
      expires_on: r.expires_on ?? null,
      note: r.note ?? null,
    });

    if (rErr) return bad(rErr.message);
    inserted++;
    if (candidates.length > 1 && !sku) {
      warnings.push(
        `Multiple items named "${name}"; matched by unit (${unit}). Consider adding SKU in CSV to pin the exact item.`
      );
    }
  }

  return NextResponse.json({ inserted, warnings });
}
