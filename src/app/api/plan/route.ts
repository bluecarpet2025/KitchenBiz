import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { effectivePlan } from "@/lib/plan";

export const dynamic = "force-dynamic";

export async function GET() {
  // initialize Supabase for session reading
  await createServerClient();

  // get the plan (no args needed)
  const plan = await effectivePlan();

  return NextResponse.json({ plan });
}
