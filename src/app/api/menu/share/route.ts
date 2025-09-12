import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const body = await req.json().catch(() => ({}));
  const menu_id = String(body?.menu_id ?? "");
  if (!menu_id) return new NextResponse("menu_id required", { status: 400 });

  // Get tenant
  const { data: prof } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .maybeSingle();
  const tenant_id = prof?.tenant_id as string | undefined;
  if (!tenant_id) return new NextResponse("No tenant", { status: 400 });

  // Ensure the menu belongs to tenant
  const { data: menu } = await supabase
    .from("menus")
    .select("id,tenant_id,name,created_at")
    .eq("id", menu_id)
    .eq("tenant_id", tenant_id)
    .maybeSingle();
  if (!menu) return new NextResponse("Menu not found", { status: 404 });

  // Reuse an existing token if present to avoid extra rows & “duplicate key” on menu_id
  const { data: existing } = await supabase
    .from("menu_shares")
    .select("id,token")
    .eq("menu_id", menu_id)
    .maybeSingle();

  if (existing?.token) {
    return NextResponse.json({ token: existing.token });
  }

  const token = crypto.randomUUID().replace(/-/g, "");
  const payload = { name: menu.name, created_at: menu.created_at };

  const { error } = await supabase
    .from("menu_shares")
    .insert({ tenant_id, menu_id, token, payload });

  if (error) return new NextResponse(error.message, { status: 400 });
  return NextResponse.json({ token });
}
