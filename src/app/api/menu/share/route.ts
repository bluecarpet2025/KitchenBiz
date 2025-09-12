import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const menuId = url.searchParams.get("menu_id");
    if (!menuId) return new NextResponse("menu_id required", { status: 400 });

    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return new NextResponse("Unauthorized", { status: 401 });

    // Tenant from profile
    const { data: prof, error: pErr } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", user.id)
      .maybeSingle();

    if (pErr) return new NextResponse(pErr.message, { status: 400 });
    const tenantId = prof?.tenant_id as string | null;
    if (!tenantId) return new NextResponse("No tenant", { status: 400 });

    // If a row already exists for (menu_id, tenant_id), return its token; otherwise create one.
    const { data: existing, error: sErr } = await supabase
      .from("menu_shares")
      .select("token")
      .eq("menu_id", menuId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (sErr) return new NextResponse(sErr.message, { status: 400 });

    if (existing?.token) {
      return NextResponse.json({ token: existing.token });
    }

    const token = crypto.randomUUID().replace(/-/g, "");
    const { error: insErr } = await supabase
      .from("menu_shares")
      .insert({ menu_id: menuId, tenant_id: tenantId, token });

    if (insErr) return new NextResponse(insErr.message, { status: 400 });

    return NextResponse.json({ token });
  } catch (e: any) {
    return new NextResponse(e?.message || "Share failed", { status: 500 });
  }
}
