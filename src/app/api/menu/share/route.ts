import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

function randToken(len = 22) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let t = "";
  for (let i = 0; i < len; i++) t += chars[Math.floor(Math.random() * chars.length)];
  return t;
}

export async function POST(req: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const body = await req.json().catch(() => ({}));
  const menu_id = String(body?.menu_id ?? "");

  // Resolve tenant by user
  const { data: prof } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  const tenant_id = prof?.tenant_id ?? null;
  if (!tenant_id || !menu_id) return new NextResponse("Bad request", { status: 400 });

  // Ensure menu belongs to tenant
  const { data: menuRow } = await supabase
    .from("menus")
    .select("id, tenant_id, name, created_at")
    .eq("id", menu_id)
    .eq("tenant_id", tenant_id)
    .maybeSingle();

  if (!menuRow) return new NextResponse("Not found", { status: 404 });

  // Try to insert; on conflict(menu_id) do nothing, then select existing.
  const token = randToken(22);
  const payload = {
    name: menuRow.name ?? "Menu",
    created_at: menuRow.created_at,
  };

  const { error: insErr } = await supabase
    .from("menu_shares")
    .insert({ tenant_id, menu_id, token, payload })
    .select("token")
    .single();

  if (!insErr) {
    return NextResponse.json({ token });
  }

  // If conflict on unique(menu_id), fetch existing token and return it.
  const { data: existing, error: selErr } = await supabase
    .from("menu_shares")
    .select("token")
    .eq("menu_id", menu_id)
    .maybeSingle();

  if (selErr || !existing) {
    return new NextResponse(insErr.message || "Share create failed", { status: 400 });
  }
  return NextResponse.json({ token: existing.token });
}
