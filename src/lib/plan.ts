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
  | "expenses_access"
  | "menu_builder"
  | "ai_reports"
  | "custom_branding";

/**
 * Minimum plan required for each feature.
 *
 * IMPORTANT: This is the source of truth for tier gating.
 * - Starter should have Inventory, Sales, Expenses, Recipes/Menu.
 * - Basic unlocks receipt photos, trends, PDFs, etc.
 * - Pro unlocks Staff, AI, Branding, POS, etc.
 * - Enterprise extends Pro with multi-location & API (handled elsewhere).
 */
const FEATURE_MIN_PLAN: Record<FeatureKey, Plan> = {
  // Starter has full access to inventory flows
  inventory_access: "starter",

  // Staff module (tab, accounts, schedules, payroll) is Pro+
  staff_accounts: "pro",

  // Receipt photo upload is Basic+
  // Starter can still use CSV-only flows handled in the UI.
  receipt_photo_upload: "basic",

  // Starter can use Sales flows (with 3-month history cap in UI logic)
  sales_access: "starter",

  // Starter can also track Expenses
  expenses_access: "starter",

  // Menu builder / recipes are Starter+
  menu_builder: "starter",

  // AI dashboards / AI financial insights are Pro+
  ai_reports: "pro",

  // Custom branding is Pro+
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

  // Normalize any weird/legacy values
  return PLAN_ORDER.includes(raw) ? raw : "starter";
}
