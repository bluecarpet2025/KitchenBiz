import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback` },
  });
  if (error) {
    const url = new URL("/login", process.env.NEXT_PUBLIC_SITE_URL);
    url.searchParams.set("error", encodeURIComponent(error.message));
    return NextResponse.redirect(url);
  }
  return NextResponse.redirect(data.url);
}
