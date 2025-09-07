import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "edge";

// Escape CSV cell
function esc(v: any) {
  const s = v == null ? "" : String(v);
  if (s.includes('"') || s.includes(",") || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const days = Number(url.searchParams.get("days") ?? 90);

  const supabase = await createServerClient();
  const { data: u } = await supabase.auth.getUser();
  const user = u.user ?? null;
  if (!user) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });

  const { data: prof } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  const tenantId = prof?.tenant_id ?? null;
  if (!tenantId) return NextResponse.json({ ok: false, error: "no_tenant" }, { status: 400 });

  // Counts in the last N days
  const sinceISO = new Date(Date.now() - days * 86400_000).toISOString();

  const { data: counts } = await supabase
    .from("inventory_counts")
    .select("id,created_at,note")
    .eq("tenant_id", tenantId)
    .gte("created_at", sinceISO)
    .order("created_at", { ascending: false });

  const countIds = (counts ?? []).map((c: any) => c.id);
  if (countIds.length === 0) {
    const empty = "count_id,created_at,note,item_id,item_name,base_unit,expected_base,counted_base,delta_base\n";
    return new NextResponse(empty, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="counts_export_${new Date().toISOString().slice(0,10)}.csv"`,
      },
    });
  }

  const { data: lines } = await supabase
    .from("inventory_count_lines")
    .select("count_id,item_id,expected_base,counted_base,delta_base")
    .eq("tenant_id", tenantId)
    .in("count_id", countIds);

  const { data: items } = await supabase
    .from("inventory_items")
    .select("id,name,base_unit")
    .eq("tenant_id", tenantId);

  const itemMap = new Map<string, { name: string | null; base_unit: string | null }>();
  (items ?? []).forEach((it: any) => itemMap.set(it.id, { name: it.name, base_unit: it.base_unit }));

  const countMeta = new Map<string, { created_at: string; note: string | null }>();
  (counts ?? []).forEach((c: any) => countMeta.set(c.id, { created_at: c.created_at, note: c.note ?? null }));

  const header = "count_id,created_at,note,item_id,item_name,base_unit,expected_base,counted_base,delta_base\n";
  const rows = (lines ?? []).map((ln: any) => {
    const meta = countMeta.get(ln.count_id)!;
    const it = itemMap.get(ln.item_id) ?? { name: null, base_unit: null };
    return [
      esc(ln.count_id),
      esc(meta?.created_at ?? ""),
      esc(meta?.note ?? ""),
      esc(ln.item_id),
      esc(it.name ?? ""),
      esc(it.base_unit ?? ""),
      esc(ln.expected_base ?? 0),
      esc(ln.counted_base ?? 0),
      esc(ln.delta_base ?? 0),
    ].join(",");
  });

  const csv = header + rows.join("\n") + "\n";

  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="counts_export_${new Date().toISOString().slice(0,10)}.csv"`,
    },
  });
}
