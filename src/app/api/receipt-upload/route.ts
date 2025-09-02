import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "edge";

export async function POST(req: Request) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Get tenant id to namespace file path
    const { data: prof, error: profErr } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", user.id)
      .maybeSingle();
    if (profErr || !prof?.tenant_id)
      return NextResponse.json({ error: "Profile missing tenant" }, { status: 400 });

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    const ext = (file.name?.split(".").pop() || "jpg").toLowerCase();
    const key = `${prof.tenant_id}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from("receipts")
      .upload(key, file, {
        contentType: file.type || "image/jpeg",
        upsert: false,
      });

    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

    return NextResponse.json({ path: key });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Upload failed" }, { status: 500 });
  }
}
