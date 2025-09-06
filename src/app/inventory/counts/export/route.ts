// src/app/inventory/counts/export/route.ts
import { createServerClient } from "@/lib/supabase/server";

function esc(v: any) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: Request) {
  const supabase = await createServerClient();

  // Auth
  const { data: u } = await supabase.auth.getUser();
  const user = u.user ?? null;
  if (!user) {
    return new Response("not_authenticated", { status: 401 });
  }

  // Tenant
  const { data: prof } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  const tenantId: string | null = prof?.tenant_id ?? null;
  if (!tenantId) {
    return new Response("no_tenant", { status: 400 });
  }

  // Query params (optional): ?days=365&max=100
  const url = new URL(req.url);
  const days = Math.max(1, parseInt(url.searchParams.get("days") || "365", 10));
  const maxCounts = Math.max(1, parseInt(url.searchParams.get("max") || "100", 10));
  const sinceISO = new Date(Date.now() - days * 86400000).toISOString();

  // 1) Latest counts for this tenant
  const { data: counts } = await supabase
    .from("inventory_counts")
    .select("id,created_at,note")
    .eq("tenant_id", tenantId)
    .gte("created_at", sinceISO)
    .order("created_at", { ascending: false })
    .limit(maxCounts);

  const countIds = (counts ?? []).map((c) => c.id);
  const countMap = new Map((counts ?? []).map((c) => [c.id, c]));

  // If no counts, return header-only CSV
  const headers = {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="inventory-counts-${new Date()
      .toISOString()
      .slice(0, 10)}.csv"`,
    "Cache-Control": "no-store, max-age=0",
  };

  const headerLine =
    "count_id,created_at,note,item_id,item_name,base_unit,expected_base,counted_base,delta_base\n";

  if (!countIds.length) {
    return new Response(headerLine, { headers });
  }

  // 2) Lines for those counts
  const { data: lines } = await supabase
    .from("inventory_count_lines")
    .select("count_id,item_id,expected_base,counted_base,delta_base")
    .in("count_id", countIds);

  const itemIds = Array.from(new Set((lines ?? []).map((l: any) => l.item_id)));
  // 3) Item names & units
  const { data: items } = await supabase
    .from("inventory_items")
    .select("id,name,base_unit")
    .in("id", itemIds);

  const itemMap = new Map((items ?? []).map((it: any) => [it.id, it]));

  // 4) Compose CSV
  const rows = (lines ?? []).map((l: any) => {
    const it = itemMap.get(l.item_id);
    const c = countMap.get(l.count_id);
    return [
      l.count_id,
      c?.created_at ?? "",
      c?.note ?? "",
      l.item_id,
      it?.name ?? "",
      it?.base_unit ?? "",
      Number(l.expected_base ?? 0),
      Number(l.counted_base ?? 0),
      Number(l.delta_base ?? 0),
    ]
      .map(esc)
      .join(",");
  });

  const csv = headerLine + rows.join("\n") + "\n";
  return new Response(csv, { headers });
}
