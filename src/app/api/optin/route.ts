import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const { email, source } = await req.json().catch(() => ({}));
    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Missing email" }, { status: 400 });
    }

    // quick validation (same as RLS but nice to fail fast)
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!re.test(email)) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    const supabase = await createServerClient();
    const { data: u } = await supabase.auth.getUser();
    const userId = u.user?.id ?? null;

    // Try insert; if duplicate, treat as success
    const { error } = await supabase
      .from("beta_signups")
      .insert({ email, source: source ?? "landing", user_id: userId });

    // Unique violation (dupe email) is ok for us
    if (error && (error.code !== "23505")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
