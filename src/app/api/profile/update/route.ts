// src/app/api/profile/update/route.ts
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const body = await req.json();
  const display_name = (body?.display_name ?? "").toString().slice(0, 120);
  const use_demo = !!body?.use_demo;

  const { error } = await supabase
    .from("profiles")
    .update({ display_name, use_demo })
    .eq("id", user.id);

  if (error) return new NextResponse(error.message, { status: 400 });
  return NextResponse.json({ ok: true });
}
