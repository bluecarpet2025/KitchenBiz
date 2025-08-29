import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const { email, note } = await req.json();

    if (!email || !/.+@.+\..+/.test(email)) {
      return NextResponse.json({ error: "Valid email required" }, { status: 400 });
    }

    const supabase = await createServerClient();

    const { error } = await supabase
      .from("beta_optins")
      .insert({ email: String(email).trim(), note: note ? String(note).trim() : null });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}
