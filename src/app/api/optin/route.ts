// src/app/api/optin/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  try {
    const { email, note } = await req.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceKey) {
      // Don’t crash build; return a clear runtime error instead.
      return NextResponse.json(
        { error: "Server not configured (missing Supabase env vars)" },
        { status: 500 }
      );
    }

    // Create the admin client at request time (not at module load).
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

    const { error } = await admin.from("beta_signups").insert({
      email,
      note: note ?? null,
    });

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("optin error:", err?.message ?? err);
    return NextResponse.json({ error: err?.message ?? "Unknown error" }, { status: 400 });
  }
}
