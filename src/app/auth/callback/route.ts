import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const redirect = url.searchParams.get("redirect") || "/";

  const supabase = await createServerClient();

  // This will read the code & set the auth cookies
  const { error } = await supabase.auth.exchangeCodeForSession(url.searchParams);
  if (error) {
    // If something goes wrong, fall back to /login with error
    const err = new URL("/login", url.origin);
    err.searchParams.set("error", error.message);
    err.searchParams.set("redirect", redirect);
    return NextResponse.redirect(err);
  }

  // All good: go where the user wanted
  const dest = new URL(redirect, url.origin);
  return NextResponse.redirect(dest);
}
