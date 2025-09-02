import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

type CsvRow = {
  item_name: string;
  sku?: string | null;
  qty: number;
  unit: string; // base or purchase unit
  total_cost_usd: number;
  expires_on?: string | null; // yyyy-mm-dd
  note?: string | null;
};

type QuickRow = {
  item_id: string;
  qty_base: number;          // already in base units
  total_cost_usd: number;
  expires_on?: string | null;
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

  // payload
  const body = await req.json().catch(() => null);
  const purchased_at: string | null =
    typeof body?.purchased_at === "string" ? body.purchased_at : null;
  const photo_path: string | null =
    typeof body?.photo_path === "string" ? body.photo_path : null;

  const rowsIn: unknown[] = Array.isArray(body?.rows) ? body.rows : [];
  if (rowsIn.length === 0) return bad("No rows provided");

  const warnings: string[] = [];
  let inserted = 0;

  // Helper to insert a receipt row
  async function insertRow(partial: {
    item_id: string;
    qty_base: number;
    total_cost_usd: number;
    expires_on?: string | null;
    note?: string | null;
  }) {
    const { error: rErr } = await supabase.from("inventory_receipts").insert({
      tenant_id: tenantId,
      item_id: partial.item_id,
      qty_base: partial.qty_base,
      total_cost_usd: partial.total_cost_usd,
      expires_on: partial.expires_on ?? null,
      note: partial.note ?? null,
      purchased_at: purchased_at ?? null,
      photo_path: photo_path ?? null,
    });

    if (rErr) return bad(rErr.message);
    inserted++;
  }

  for (const raw of rowsIn) {
    // Path A: quick form (has item_id)
    if (raw && typeof (raw as any).item_id === "string") {
      const r = raw as QuickRow;
      const qty_base = Number(r.qty_base);
      const cost = Number(r.total_cost_usd);

      if (!r.item_id) return bad("Missing item_id");
      if (!Number.isFinite(qty_base) || qty_base <= 0)
        return bad("Invalid qty_base");
      if (!Number.isFinite(cost) || cost < 0)
        return bad("Invalid total_cost_usd");

      const { data: exists, error: iErr } = await supabase
        .from("inventory_items")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("id", r.item_id)
        .maybeSingle();
      if (iErr) return bad(iErr.message);
      if (!exists) return bad("Item not found for this tenant");

      const res = await insertRow({
        item_id: r.item_id,
        qty_base,
        total_cost_usd: cost,
        expires_on: r.expires_on ?? null,
        note: r.note ?? null,
      });
      if (res) return res; // bubble up bad(...)
      continue;
    }

    // Path B: CSV import (your original behavior)
    const r = raw as CsvRow;
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

    // Find item by (tenant, name) and disambiguate by unit (prefer base), then SKU if provided
    const { data: candidates, error: iErr } = await supabase
      .from("inventory_items")
      .select("id, name, base_unit, purchase_unit, pack_to_base_factor, sku")
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

    const res = await insertRow({
      item_id: item.id,
      qty_base,
      total_cost_usd: cost,
      expires_on: r.expires_on ?? null,
      note: r.note ?? null,
    });
    if (res) return res;

    if (candidates.length > 1 && !sku) {
      warnings.push(
        `Multiple items named "${name}"; matched by unit (${unit}). Consider adding SKU in CSV to pin the exact item.`
      );
    }
  }

  return NextResponse.json({ inserted, warnings });
}
