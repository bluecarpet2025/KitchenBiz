// src/app/staff/manage/page.tsx
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { getEffectiveTenant } from "@/lib/effective-tenant";
import StaffEditorClient from "@/components/StaffEditorClient";
import { effectivePlan, canUseFeature } from "@/lib/plan";

export const dynamic = "force-dynamic";

export default async function StaffManagePage() {
  const supabase = await createServerClient();
  const { data: au } = await supabase.auth.getUser();
  const user = au.user ?? null;

  if (!user) {
    return (
      <main className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Manage Staff</h1>
        <p className="mt-3">Sign in required.</p>
        <Link className="underline" href="/login?redirect=/staff/manage">
          Go to login
        </Link>
      </main>
    );
  }

  // Plan gating: Staff is Pro+ only
  const plan = await effectivePlan();
  if (!canUseFeature(plan, "staff_accounts")) {
    return (
      <main className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-semibold mb-3">Upgrade Required</h1>
        <p className="opacity-80">
          The Staff module (accounts, schedules, and payroll) is available
          starting with the <strong>Pro plan</strong>.
        </p>
        <p className="mt-2 opacity-80">
          <strong>Enterprise</strong> includes everything in Pro plus unlimited
          locations and users under a single account.
        </p>
        <p className="mt-4">
          <Link href="/profile" className="underline">
            Go to Profile
          </Link>{" "}
          to view plans and upgrade your account.
        </p>
      </main>
    );
  }

  const tenantId = await getEffectiveTenant(supabase);
  if (!tenantId) {
    return (
      <main className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Manage Staff</h1>
        <p className="mt-3">Profile missing tenant.</p>
      </main>
    );
  }

  const { data: rows } = await supabase
    .from("employees")
    .select(
      "id, first_name, last_name, display_name, email, phone, role, pay_type, pay_rate_usd, hire_date, end_date, is_active, notes"
    )
    .eq("tenant_id", tenantId)
    .order("display_name", { ascending: true });

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Manage Staff</h1>
        <Link
          href="/staff"
          className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
        >
          Back to Staff
        </Link>
      </div>
      <StaffEditorClient
        tenantId={tenantId}
        initialRows={(rows ?? []) as any[]}
      />
    </main>
  );
}
