// src/app/api/stripe/checkout/route.ts
import "server-only";
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe, assertStripeEnv } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SubscriptionPlan = "basic" | "pro" | "enterprise";
type OneTimeSku = "ai_deep_business_report";

type Body =
  | { kind: "subscription"; plan: SubscriptionPlan }
  | { kind: "one_time"; sku: OneTimeSku };

function priceIdForPlan(plan: SubscriptionPlan) {
  if (plan === "basic") return process.env.STRIPE_PRICE_BASIC!;
  if (plan === "pro") return process.env.STRIPE_PRICE_PRO!;
  if (plan === "enterprise") {
    const ent = process.env.STRIPE_PRICE_ENTERPRISE;
    if (!ent) throw new Error("Enterprise price id missing (STRIPE_PRICE_ENTERPRISE)");
    return ent;
  }
  throw new Error("Unknown plan");
}

function priceIdForSku(sku: OneTimeSku) {
  if (sku === "ai_deep_business_report") return process.env.STRIPE_PRICE_AI_DEEP_REPORT!;
  throw new Error("Unknown sku");
}

export async function POST(req: Request) {
  assertStripeEnv();

  const supabase = await createServerClient();
  const { data: au } = await supabase.auth.getUser();
  const user = au.user;

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body?.kind) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  // Get tenant + role + demo from profile
  const { data: prof } = await supabase
    .from("profiles")
    .select("tenant_id, role, use_demo, plan")
    .eq("id", user.id)
    .maybeSingle();

  const tenantId = (prof?.tenant_id as string | null) ?? null;
  if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 400 });
  if (prof?.use_demo) return NextResponse.json({ error: "Demo mode cannot purchase" }, { status: 400 });

  const role = String(prof?.role ?? "owner");
  if (role !== "owner") return NextResponse.json({ error: "Only owner can manage billing" }, { status: 403 });

  // Create/reuse Stripe customer for tenant
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("stripe_customers")
    .select("stripe_customer_id")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  let customerId = existing?.stripe_customer_id as string | undefined;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      metadata: {
        tenant_id: tenantId,
        owner_user_id: user.id,
      },
    });

    customerId = customer.id;

    await admin.from("stripe_customers").insert({
      tenant_id: tenantId,
      owner_user_id: user.id,
      stripe_customer_id: customerId,
    });
  }

  const origin = req.headers.get("origin") || "http://localhost:3000";
  const successUrl = `${origin}/profile?billing=success`;
  const cancelUrl = `${origin}/profile?billing=cancel`;

  // Subscription checkout
  if (body.kind === "subscription") {
    const priceId = priceIdForPlan(body.plan);

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      allow_promotion_codes: true,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      subscription_data: {
        metadata: {
          tenant_id: tenantId,
          owner_user_id: user.id,
          plan: body.plan,
        },
      },
      metadata: {
        tenant_id: tenantId,
        owner_user_id: user.id,
        plan: body.plan,
        kind: "subscription",
      },
    });

    return NextResponse.json({ url: session.url });
  }

  // One-time purchase
  if (body.kind === "one_time") {
    // Optional gate: require Basic+ (matches your product definition)
    const currentPlan = String(prof?.plan ?? "starter");
    if (currentPlan === "starter") {
      return NextResponse.json({ error: "Upgrade to Basic to purchase this." }, { status: 403 });
    }

    const priceId = priceIdForSku(body.sku);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      allow_promotion_codes: true,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        tenant_id: tenantId,
        owner_user_id: user.id,
        kind: "one_time",
        sku: body.sku,
      },
    });

    return NextResponse.json({ url: session.url });
  }

  return NextResponse.json({ error: "Unsupported kind" }, { status: 400 });
}
