import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "edge";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const path = url.searchParams.get("path") || "";
  if (!path) return new NextResponse("Missing path", { status: 400 });

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  // Verify tenant owns this path
  const { data: prof } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!prof?.tenant_id) return new NextResponse("No tenant", { status: 400 });

  // Cheap guard: path should start with tenant folder
  if (!path.startsWith(`${prof.tenant_id}/`)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  // (Optional stricter check): make sure a row exists with this photo_path
  const { data: exists } = await supabase
    .from("inventory_receipts")
    .select("id")
    .eq("tenant_id", prof.tenant_id)
    .eq("photo_path", path)
    .limit(1)
    .maybeSingle();

  if (!exists) return new NextResponse("Not found", { status: 404 });

  const { data: signed, error } = await supabase
    .storage
    .from("receipts")
    .createSignedUrl(path, 60); // 60s

  if (error || !signed?.signedUrl) {
    return new NextResponse("Could not sign", { status: 400 });
  }
  return NextResponse.redirect(signed.signedUrl, 302);
}
