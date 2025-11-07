// src/lib/plan.ts
import "server-only";
import { createServerClient } from "@/lib/supabase/server";

export type Plan = "starter" | "basic" | "pro" | "enterprise";
export const PLAN_ORDER: Plan[] = ["starter", "basic", "pro", "enterprise"];

/** All feature flags we gate in the app */
export type FeatureKey =
  | "inventory_access"
  | "staff_accounts"
  | "receipt_photo_upload"
  | "sales_access"
  | "expenses_access"     // ← added
  | "menu_builder"
  | "ai_reports"
  | "custom_branding";

/** Minimum plan required for each feature */
const FEATURE_MIN_PLAN: Record<FeatureKey, Plan> = {
  inventory_access: "basic",
  staff_accounts: "basic",
  receipt_photo_upload: "basic", // Starter still allowed CSV-only flows elsewhere in UI logic
  sales_access: "basic",
  expenses_access: "basic",      // ← Basic+
  menu_builder: "basic",
  ai_reports: "pro",             // Financials/Insights gating
  custom_branding: "pro",
};

export function canUseFeature(plan: Plan, feature: FeatureKey): boolean {
  const need = FEATURE_MIN_PLAN[feature];
  return PLAN_ORDER.indexOf(plan) >= PLAN_ORDER.indexOf(need);
}

/** Read the user’s effective plan from profiles; defaults to starter if unknown */
export async function effectivePlan(): Promise<Plan> {
  const supabase = await createServerClient();
  const { data: au } = await supabase.auth.getUser();
  const uid = au.user?.id;
  if (!uid) return "starter";

  const { data: prof } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", uid)
    .maybeSingle();

  const raw = (prof?.plan as Plan | null) ?? "starter";
  // normalize any weird/legacy values
  return PLAN_ORDER.includes(raw) ? raw : "starter";
}
