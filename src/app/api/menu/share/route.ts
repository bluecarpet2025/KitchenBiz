import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

function makeToken() {
  return crypto.randomUUID().replace(/-/g, "");
}

export async function POST(req: Request) {
  const supabase = await createServerClient();
  const body = await req.json().catch(() => ({}));
  const menu_id = String(body?.menu_id ?? "");

  if (!menu_id) return new NextResponse("menu_id required", { status: 400 });

  // auth → tenant
  const { data: u } = await supabase.auth.getUser();
  const userId = u.user?.id;
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });

  const { data: prof, error: pErr } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", userId)
    .maybeSingle();

  if (pErr || !prof?.tenant_id) return new NextResponse("Tenant not found", { status: 400 });

  const tenant_id = String(prof.tenant_id);
  const token = makeToken();

  // Unique on menu_id: upsert avoids duplicate key errors.
  const { error } = await supabase
    .from("menu_shares")
    .upsert({ menu_id, tenant_id, token }, { onConflict: "menu_id" });

  if (error) return new NextResponse(error.message, { status: 400 });
  return NextResponse.json({ token });
}
