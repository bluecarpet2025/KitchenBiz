// /src/lib/plan.ts
// Utilities for plan + feature gating across KitchenBiz

import { createServerClient } from "@/lib/supabase/server";

/** Type safety for all supported plans */
export type PlanType = "starter" | "basic" | "pro" | "enterprise";

/** Get the current user's effective plan from Supabase */
export async function effectivePlan(): Promise<PlanType> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return "starter";

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", user.id)
    .maybeSingle();

  return (profile?.plan as PlanType) ?? "starter";
}

/** Simple static permission table */
const featureMatrix: Record<
  string,
  PlanType[]
> = {
  demo_mode: ["starter", "basic", "pro", "enterprise"],
  staff_accounts: ["basic", "pro", "enterprise"],
  photo_upload: ["basic", "pro", "enterprise"],
  ai_tools: ["pro", "enterprise"],
  forecasting: ["pro", "enterprise"],
  branding_ui: ["basic", "pro", "enterprise"],
  pos_integration: ["pro", "enterprise"],
  api_access: ["enterprise"],
};

/** Returns true if the feature is allowed for this plan */
export function canUseFeature(plan: PlanType, feature: string): boolean {
  const allowed = featureMatrix[feature];
  if (!allowed) return false;
  return allowed.includes(plan);
}

/**
 * Example pattern:
 * const plan = await effectivePlan();
 * if (!canUseFeature(plan, "staff_accounts")) { redirect("/upgrade"); }
 */
