// src/app/api/stripe/portal/route.ts
import "server-only";
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe, assertStripeEnv } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  assertStripeEnv();

  const supabase = await createServerClient();
  const { data: au } = await supabase.auth.getUser();
  const user = au.user;

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: prof } = await supabase
    .from("profiles")
    .select("tenant_id, role, use_demo")
    .eq("id", user.id)
    .maybeSingle();

  const tenantId = (prof?.tenant_id as string | null) ?? null;
  if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 400 });
  if (prof?.use_demo) return NextResponse.json({ error: "Demo mode cannot manage billing" }, { status: 400 });

  const role = String(prof?.role ?? "owner");
  if (role !== "owner") return NextResponse.json({ error: "Only owner can manage billing" }, { status: 403 });

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("stripe_customers")
    .select("stripe_customer_id")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const customerId = existing?.stripe_customer_id as string | undefined;
  if (!customerId) return NextResponse.json({ error: "No Stripe customer yet" }, { status: 400 });

  const origin = req.headers.get("origin") || "http://localhost:3000";
  const returnUrl = `${origin}/profile`;

  const portal = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });

  return NextResponse.json({ url: portal.url });
}
