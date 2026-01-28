// src/lib/plan.ts
import "server-only";
import { createServerClient } from "@/lib/supabase/server";

export type Plan = "starter" | "basic" | "pro";

export const PLAN_ORDER: Plan[] = ["starter", "basic", "pro"];

/** All feature flags we gate in the app */
export type FeatureKey =
  | "inventory_access"
  | "staff_accounts"
  | "receipt_photo_upload"
  | "sales_access"
  | "expenses_access"
  | "menu_builder"
  | "ai_reports"
  | "custom_branding";

/**
 * Minimum plan required for each feature.
 *
 * IMPORTANT: This is the source of truth for tier gating.
 * - Starter: Inventory, Sales, Expenses, Recipes/Menu.
 * - Basic: Receipt photos, trends, exports.
 * - Pro: Staff and customization. (AI features are planned, but gating can remain here.)
 */
const FEATURE_MIN_PLAN: Record<FeatureKey, Plan> = {
  inventory_access: "starter",
  staff_accounts: "pro",
  receipt_photo_upload: "basic",
  sales_access: "starter",
  expenses_access: "starter",
  menu_builder: "starter",
  ai_reports: "pro",
  custom_branding: "pro",
};

export function canUseFeature(plan: Plan, feature: FeatureKey): boolean {
  const need = FEATURE_MIN_PLAN[feature];
  return PLAN_ORDER.indexOf(plan) >= PLAN_ORDER.indexOf(need);
}

/**
 * Normalize any legacy or unknown plan values.
 * - "enterprise" (legacy) => "pro"
 * - unknown => "starter"
 */
function normalizePlan(raw: unknown): Plan {
  if (raw === "pro") return "pro";
  if (raw === "basic") return "basic";
  if (raw === "starter") return "starter";
  // legacy value still possibly in DB
  if (raw === "enterprise") return "pro";
  return "starter";
}

/**
 * Read the user’s effective plan.
 *
 * ADMIN OVERRIDE:
 * - role = 'admin' ALWAYS resolves to 'pro' (highest plan now)
 * - Stripe can never downgrade admin accounts
 */
export async function effectivePlan(): Promise<Plan> {
  const supabase = await createServerClient();
  const { data: au } = await supabase.auth.getUser();
  const uid = au.user?.id;
  if (!uid) return "starter";

  const { data: prof } = await supabase
    .from("profiles")
    .select("plan, role")
    .eq("id", uid)
    .maybeSingle();

  // 🔒 HARD ADMIN OVERRIDE
  if (prof?.role === "admin") {
    return "pro";
  }

  return normalizePlan(prof?.plan);
}
