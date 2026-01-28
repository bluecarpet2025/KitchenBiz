// src/app/api/stripe/webhook/route.ts
import "server-only";

import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Map active Stripe subscription → app plan (highest wins) */
function planFromSubscription(sub: any): "starter" | "basic" | "pro" {
  const items = sub?.items?.data ?? [];
  const activePriceIds = items.map((it: any) => it?.price?.id).filter(Boolean);

  const pro = process.env.STRIPE_PRICE_PRO;
  const basic = process.env.STRIPE_PRICE_BASIC;

  if (pro && activePriceIds.includes(pro)) return "pro";
  if (basic && activePriceIds.includes(basic)) return "basic";
  return "starter";
}

async function tenantIdForStripeCustomer(stripeCustomerId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("stripe_customers")
    .select("tenant_id")
    .eq("stripe_customer_id", stripeCustomerId)
    .maybeSingle();

  if (error) throw new Error(`stripe_customers lookup failed: ${error.message}`);
  return (data?.tenant_id as string | null) ?? null;
}

async function upsertSubscriptionSnapshot(tenantId: string, sub: any, plan: string) {
  const admin = createAdminClient();
  const stripeSubId = String(sub.id);

  await admin.from("stripe_subscriptions").upsert(
    {
      tenant_id: tenantId,
      stripe_subscription_id: stripeSubId,
      status: sub.status ?? null,
      current_period_start: sub.current_period_start
        ? new Date(sub.current_period_start * 1000).toISOString()
        : null,
      current_period_end: sub.current_period_end
        ? new Date(sub.current_period_end * 1000).toISOString()
        : null,
      cancel_at_period_end: sub.cancel_at_period_end ?? null,
      plan,
    },
    { onConflict: "stripe_subscription_id" }
  );
}

async function applyPlanToTenantProfiles(tenantId: string, plan: "starter" | "basic" | "pro") {
  const admin = createAdminClient();
  // Keep it simple: all users in tenant inherit tenant plan
  await admin.from("profiles").update({ plan }).eq("tenant_id", tenantId);
}

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Missing STRIPE_WEBHOOK_SECRET" }, { status: 500 });

  const rawBody = await req.text();
  let event: any;

  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (err: any) {
    return NextResponse.json(
      { error: `Webhook Error: ${err?.message ?? "invalid"}` },
      { status: 400 }
    );
  }

  try {
    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      const sub = event.data.object;
      const stripeCustomerId = String(sub?.customer ?? "");
      if (!stripeCustomerId) return NextResponse.json({ received: true });

      const tenantId = await tenantIdForStripeCustomer(stripeCustomerId);
      if (!tenantId) return NextResponse.json({ received: true });

      const plan = planFromSubscription(sub);

      await upsertSubscriptionSnapshot(tenantId, sub, plan);
      await applyPlanToTenantProfiles(tenantId, plan);
    }

    // Keep for later one-time fulfillment (Deep Business Report)
    if (event.type === "checkout.session.completed") {
      // const session = event.data.object;
      // session.metadata.kind === "one_time" etc.
    }

    return NextResponse.json({ received: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Webhook handler failed" },
      { status: 500 }
    );
  }
}
