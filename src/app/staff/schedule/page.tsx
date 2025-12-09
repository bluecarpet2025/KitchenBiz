// src/app/staff/schedule/page.tsx
import { createServerClient } from "@/lib/supabase/server";
import { getEffectiveTenant } from "@/lib/effective-tenant";
import { effectivePlan, canUseFeature } from "@/lib/plan";
import StaffScheduleClient from "@/components/StaffScheduleClient";
import Link from "next/link";

export const dynamic = "force-dynamic";

type Employee = {
  id: string;
  display_name: string | null;
  is_active: boolean | null;
};

type ScheduleRow = {
  id: string;
  employee_id: string;
  shift_date: string; // YYYY-MM-DD
  start_time: string; // HH:MM:SS
  end_time: string;   // HH:MM:SS
  hours: number;
  notes: string | null;
};

export default async function StaffSchedulePage() {
  const supabase = await createServerClient();
  const { data: au } = await supabase.auth.getUser();
  const user = au.user ?? null;

  if (!user) {
    return (
      <main className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Staff schedule</h1>
        <p className="mt-3">Sign in required.</p>
        <Link className="underline" href="/login?redirect=/staff/schedule">
          Go to login
        </Link>
      </main>
    );
  }

  const plan = await effectivePlan();
  if (!canUseFeature(plan, "staff_accounts")) {
    return (
      <main className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-semibold mb-3">Upgrade Required</h1>
        <p className="opacity-80">
          The Staff schedule is available starting with the{" "}
          <strong>Pro plan</strong>.
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

  const tenantId = await getEffectiveTenant();
  if (!tenantId) {
    return (
      <main className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Staff schedule</h1>
        <p className="mt-3">Profile missing tenant.</p>
      </main>
    );
  }

  const { data: employeeRows } = await supabase
    .from("employees")
    .select("id, display_name, is_active")
    .eq("tenant_id", tenantId)
    .order("display_name", { ascending: true });

  const employees = (employeeRows ?? []) as Employee[];

  // Fetch schedules for current month +/- 1 month
  const base = new Date();
  const start = new Date(base.getFullYear(), base.getMonth() - 1, 1);
  const end = new Date(base.getFullYear(), base.getMonth() + 2, 0);

  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);

  const { data: scheduleRows } = await supabase
    .from("staff_schedules")
    .select(
      "id, employee_id, shift_date, start_time, end_time, hours, notes"
    )
    .eq("tenant_id", tenantId)
    .gte("shift_date", startStr)
    .lte("shift_date", endStr);

  const schedules = (scheduleRows ?? []) as unknown as ScheduleRow[];

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Staff schedule</h1>
          <p className="text-sm text-neutral-400 mt-1">
            Plan weekly and monthly coverage. Click a day to add or edit shifts.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/staff"
            className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
          >
            Back to Staff
          </Link>
        </div>
      </div>

      <StaffScheduleClient
        employees={employees}
        initialSchedules={schedules}
      />
    </main>
  );
}
