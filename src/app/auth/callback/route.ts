import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const redirect = url.searchParams.get("redirect") || "/";

  const supabase = await createServerClient();

  // pass the raw query string, not URLSearchParams
  const { error } = await supabase.auth.exchangeCodeForSession(url.searchParams.toString());
  if (error) {
    const err = new URL("/login", url.origin);
    err.searchParams.set("error", error.message);
    err.searchParams.set("redirect", redirect);
    return NextResponse.redirect(err);
  }

  const dest = new URL(redirect, url.origin);
  return NextResponse.redirect(dest);
}
