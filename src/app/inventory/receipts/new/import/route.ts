// src/app/inventory/receipts/import/route.ts
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

type IncomingRow = {
  item_name: string;
  qty: number;
  unit: string;            // either the item's base unit or purchase unit
  total_cost_usd: number;  // total receipt cost for this line
  expires_on?: string | null; // YYYY-MM-DD or null
  note?: string | null;
};

export async function POST(req: Request) {
  try {
    const supabase = await createServerClient();

    // Auth + tenant
    const { data: u } = await supabase.auth.getUser();
    const user = u.user ?? null;
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { data: prof, error: pErr } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", user.id)
      .maybeSingle();
    if (pErr) throw pErr;
    if (!prof?.tenant_id) {
      return NextResponse.json({ error: "No tenant for profile" }, { status: 400 });
    }
    const tenantId: string = prof.tenant_id;

    // Body
    const body = await req.json().catch(() => null);
    const rows = (body?.rows ?? []) as IncomingRow[];
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "No rows in request" }, { status: 400 });
    }

    // Pull all mentioned items for fast lookup
    const names = Array.from(new Set(rows.map(r => (r.item_name || "").trim()))).filter(Boolean);
    const { data: items, error: iErr } = await supabase
      .from("inventory_items")
      .select("id,name,base_unit,purchase_unit,pack_to_base_factor")
      .eq("tenant_id", tenantId)
      .in("name", names);

    if (iErr) throw iErr;

    const byName = new Map(items?.map(i => [i.name.toLowerCase(), i]));
    const missing: string[] = [];
    const inserts: any[] = [];

    for (const r of rows) {
      const key = (r.item_name || "").toLowerCase();
      const item = byName.get(key);
      if (!item) {
        missing.push(r.item_name);
        continue;
      }

      const qty = Number(r.qty ?? 0);
      if (!Number.isFinite(qty) || qty <= 0) {
        return NextResponse.json({ error: `Invalid qty for "${r.item_name}"` }, { status: 400 });
      }

      const unit = (r.unit || "").trim();
      let qty_base = qty;

      // Convert to base units if the upload used purchase units
      if (unit && unit !== item.base_unit) {
        if (unit === item.purchase_unit) {
          const factor = Number(item.pack_to_base_factor ?? 1);
          qty_base = qty * factor;
        } else {
          return NextResponse.json(
            {
              error: `Unit mismatch for "${r.item_name}": "${unit}" is not "${item.base_unit}" or "${item.purchase_unit}".`,
            },
            { status: 400 }
          );
        }
      }

      inserts.push({
        tenant_id: tenantId,
        item_id: item.id,
        qty_base,
        total_cost_usd: Number(r.total_cost_usd ?? 0),
        expires_on: r.expires_on ?? null,
        note: r.note ?? null,
      });
    }

    if (missing.length) {
      return NextResponse.json(
        { error: `Items not found: ${missing.join(", ")}` },
        { status: 400 }
      );
    }

    // Insert receipts — your trigger should create matching inventory_transactions
    const { data: inserted, error: insErr } = await supabase
      .from("inventory_receipts")
      .insert(inserts)
      .select("id");

    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 400 });
    }

    return NextResponse.json({ inserted: inserted?.length ?? 0 }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}
