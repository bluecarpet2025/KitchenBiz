// src/lib/stripe.ts
import Stripe from "stripe";

const apiVersion = (process.env.STRIPE_API_VERSION ||
  "2025-12-15.clover") as Stripe.LatestApiVersion;

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion,
});

export function assertStripeEnv() {
  const required = [
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_PRICE_BASIC",
    "STRIPE_PRICE_PRO",
    "STRIPE_PRICE_AI_DEEP_REPORT",
  ];

  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(`Missing env var(s): ${missing.join(", ")}`);
  }
}
