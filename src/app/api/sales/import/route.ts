// src/app/api/sales/import/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getEffectiveTenant } from "@/lib/effective-tenant";

type InRow = {
  occurred_at?: string;
  source?: string;
  channel?: string;
  order_ref?: string;
  product_name?: string;
  qty?: string | number;
  unit_price?: string | number;
};

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return NextResponse.json({ error: "auth" }, { status: 401 });

    const body = await req.json();
    const tenantFromBody: string | undefined = body?.tenantId;
    const tenantId = tenantFromBody || (await getEffectiveTenant(supabase));
    if (!tenantId) return NextResponse.json({ error: "no tenant" }, { status: 400 });

    const rows: InRow[] = Array.isArray(body?.rows) ? body.rows : [];
    if (rows.length === 0) return NextResponse.json({ error: "empty" }, { status: 400 });

    // Group by order_ref (fallback to index)
    type Bucket = { occurred_at: string; source: string; channel: string; lines: { product_name: string; qty: number; unit_price: number }[] };
    const buckets = new Map<string, Bucket>();

    function normDate(s?: string): string {
      if (!s) return new Date().toISOString();
      // accept YYYY-MM-DD or ISO
      const t = s.length <= 10 ? new Date(`${s}T00:00:00Z`) : new Date(s);
      return isNaN(t.getTime()) ? new Date().toISOString() : t.toISOString();
    }
    function normNum(x: any): number {
      const n = Number(x);
      return Number.isFinite(n) ? n : 0;
    }
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] || {};
      const key = (r.order_ref ?? "").trim() || `row-${i+1}`;
      const b = buckets.get(key) ?? {
        occurred_at: normDate(r.occurred_at),
        source: (r.source ?? "").slice(0, 30),
        channel: (r.channel ?? "").slice(0, 30),
        lines: [],
      };
      b.lines.push({
        product_name: (r.product_name ?? "Item").slice(0, 120),
        qty: Math.max(0, normNum(r.qty)),
        unit_price: Math.max(0, normNum(r.unit_price)),
      });
      buckets.set(key, b);
    }

    // Insert orders
    const orderRows = Array.from(buckets.values()).map(b => ({
      tenant_id: tenantId,
      occurred_at: b.occurred_at,
      source: b.source || "import",
      channel: b.channel || "other",
    }));
    let insertedOrders = 0;
    let insertedLines = 0;

    // Insert in chunks
    const CHUNK = 1000;
    const orderIds: string[] = [];
    for (let i=0; i<orderRows.length; i+=CHUNK) {
      const slice = orderRows.slice(i, i+CHUNK);
      const { data, error } = await supabase.from("sales_orders").insert(slice).select("id");
      if (error) throw error;
      insertedOrders += data?.length ?? 0;
      data?.forEach((d: any) => orderIds.push(d.id as string));
    }

    // Build lines from inserted orderIds in same order
    const flatLines: any[] = [];
    const bucketArr = Array.from(buckets.values());
    for (let i=0; i<bucketArr.length; i++) {
      const order_id = orderIds[i];
      const b = bucketArr[i];
      for (const ln of b.lines) {
        flatLines.push({
          tenant_id: tenantId,
          order_id,
          product_name: ln.product_name,
          qty: ln.qty,
          unit_price: ln.unit_price,
        });
      }
    }

    for (let i=0; i<flatLines.length; i+=CHUNK) {
      const slice = flatLines.slice(i, i+CHUNK);
      const { error } = await supabase.from("sales_order_lines").insert(slice);
      if (error) throw error;
      insertedLines += slice.length;
    }

    return NextResponse.json({ ok: true, insertedOrders, insertedLines });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err?.message ?? "error" }, { status: 500 });
  }
}
