// src/app/staff/page.tsx
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { getEffectiveTenant } from "@/lib/effective-tenant";
import { effectivePlan, canUseFeature } from "@/lib/plan";

export const dynamic = "force-dynamic";

type Emp = {
  id: string;
  display_name: string | null;
  role: string | null;
  pay_type: string | null;
  pay_rate_usd: number | null;
  is_active: boolean | null;
};

type LaborShift = {
  id: string;
  occurred_at: string;
  hours: string | number;
  wage_usd: string | number;
};

export default async function StaffPage() {
  const supabase = await createServerClient();
  const { data: au } = await supabase.auth.getUser();
  const user = au.user ?? null;

  if (!user) {
    return (
      <main className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Staff</h1>
        <p className="mt-3">Sign in required.</p>
        <Link className="underline" href="/login?redirect=/staff">
          Go to login
        </Link>
      </main>
    );
  }

  // Staff module is Pro+ only
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

  const tenantId = await getEffectiveTenant();
  if (!tenantId) {
    return (
      <main className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Staff</h1>
        <p className="mt-3">Profile missing tenant.</p>
      </main>
    );
  }

  // Fetch staff roster
  const { data: employeeRows } = await supabase
    .from("employees")
    .select("id, display_name, role, pay_type, pay_rate_usd, is_active")
    .eq("tenant_id", tenantId)
    .order("display_name", { ascending: true });

  const emps = (employeeRows ?? []) as Emp[];

  const totalCount = emps.length;
  const activeCount = emps.filter((e) => e.is_active).length;
  const hourlyCount = emps.filter((e) => e.pay_type === "hourly").length;
  const salaryCount = emps.filter((e) => e.pay_type === "salary").length;

  // Fetch labor shifts for schedule/payroll overview
  const { data: shiftRows } = await supabase
    .from("labor_shifts")
    .select("id, occurred_at, hours, wage_usd")
    .eq("tenant_id", tenantId)
    .order("occurred_at", { ascending: false })
    .limit(200);

  const shifts = (shiftRows ?? []) as LaborShift[];

  const now = new Date();
  const DAY_MS = 24 * 60 * 60 * 1000;
  const THIRTY_DAYS_MS = 30 * DAY_MS;
  const FOURTEEN_DAYS_MS = 14 * DAY_MS;

  const recentShifts30 = shifts.filter((s) => {
    const d = new Date(s.occurred_at);
    return now.getTime() - d.getTime() <= THIRTY_DAYS_MS;
  });

  const recentShifts14 = shifts.filter((s) => {
    const d = new Date(s.occurred_at);
    return now.getTime() - d.getTime() <= FOURTEEN_DAYS_MS;
  });

  const totalHours30 = recentShifts30.reduce(
    (sum, s) => sum + Number(s.hours ?? 0),
    0
  );
  const totalWages30 = recentShifts30.reduce(
    (sum, s) => sum + Number(s.hours ?? 0) * Number(s.wage_usd ?? 0),
    0
  );
  const avgWage30 = totalHours30 > 0 ? totalWages30 / totalHours30 : 0;

  // Schedule-by-day: aggregate last 14 days of shifts
  const scheduleMap = new Map<
    string,
    { date: Date; hours: number; cost: number }
  >();

  for (const s of recentShifts14) {
    const d = new Date(s.occurred_at);
    const dateKey = d.toISOString().slice(0, 10); // YYYY-MM-DD
    const hours = Number(s.hours ?? 0);
    const wage = Number(s.wage_usd ?? 0);
    const cost = hours * wage;

    const existing = scheduleMap.get(dateKey);
    if (existing) {
      existing.hours += hours;
      existing.cost += cost;
    } else {
      scheduleMap.set(dateKey, { date: d, hours, cost });
    }
  }

  const scheduleDays = Array.from(scheduleMap.values()).sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Staff</h1>
        <div className="flex gap-2">
          <Link
            href="/staff/manage"
            className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
            prefetch={false}
          >
            Manage
          </Link>
          <Link
            href="/staff/schedule"
            className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
            prefetch={false}
          >
            Schedule
          </Link>
          <Link
            href="/staff/import"
            className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
            prefetch={false}
          >
            Import CSV
          </Link>
          <Link
            href="/staff/import/template"
            className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
            prefetch={false}
          >
            Download template
          </Link>
        </div>
      </div>

      {/* At-a-glance metrics */}
      <section className="grid gap-3 md:grid-cols-4 text-sm">
        <div className="rounded-lg border border-neutral-800 p-3">
          <div className="text-xs uppercase tracking-wide text-neutral-400">
            Total staff
          </div>
          <div className="mt-1 text-lg font-semibold">{totalCount}</div>
        </div>
        <div className="rounded-lg border border-neutral-800 p-3">
          <div className="text-xs uppercase tracking-wide text-neutral-400">
            Active
          </div>
          <div className="mt-1 text-lg font-semibold">{activeCount}</div>
        </div>
        <div className="rounded-lg border border-neutral-800 p-3">
          <div className="text-xs uppercase tracking-wide text-neutral-400">
            Hourly
          </div>
          <div className="mt-1 text-lg font-semibold">{hourlyCount}</div>
        </div>
        <div className="rounded-lg border border-neutral-800 p-3">
          <div className="text-xs uppercase tracking-wide text-neutral-400">
            Salary
          </div>
          <div className="mt-1 text-lg font-semibold">{salaryCount}</div>
        </div>
      </section>

      {/* Schedule by day (last 14 days) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            Schedule by day (last 14 days)
          </h2>
          <p className="text-xs text-neutral-400">
            Total hours and labor cost per day based on entries in{" "}
            <code>labor_shifts</code>.
          </p>
        </div>
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-900/60">
              <tr>
                <th className="p-2 text-left">Date</th>
                <th className="p-2 text-left">Day</th>
                <th className="p-2 text-right">Total hours</th>
                <th className="p-2 text-right">Labor cost</th>
              </tr>
            </thead>
            <tbody>
              {scheduleDays.map((d) => (
                <tr key={d.date.toISOString()} className="border-t">
                  <td className="p-2">
                    {d.date.toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </td>
                  <td className="p-2">
                    {d.date.toLocaleDateString(undefined, {
                      weekday: "short",
                    })}
                  </td>
                  <td className="p-2 text-right">
                    {d.hours.toFixed(2)}
                  </td>
                  <td className="p-2 text-right">
                    {d.cost.toLocaleString(undefined, {
                      style: "currency",
                      currency: "USD",
                    })}
                  </td>
                </tr>
              ))}
              {scheduleDays.length === 0 && (
                <tr>
                  <td className="p-3 text-neutral-400" colSpan={4}>
                    No labor shifts recorded for the last 14 days.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Payroll overview - last 30 days */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            Labor &amp; payroll (last 30 days)
          </h2>
        </div>
        <div className="grid gap-3 md:grid-cols-3 text-sm">
          <div className="rounded-lg border border-neutral-800 p-3">
            <div className="text-xs uppercase tracking-wide text-neutral-400">
              Total hours
            </div>
            <div className="mt-1 text-lg font-semibold">
              {totalHours30.toFixed(2)}
            </div>
          </div>
          <div className="rounded-lg border border-neutral-800 p-3">
            <div className="text-xs uppercase tracking-wide text-neutral-400">
              Labor cost
            </div>
            <div className="mt-1 text-lg font-semibold">
              {totalWages30.toLocaleString(undefined, {
                style: "currency",
                currency: "USD",
              })}
            </div>
          </div>
          <div className="rounded-lg border border-neutral-800 p-3">
            <div className="text-xs uppercase tracking-wide text-neutral-400">
              Avg hourly wage
            </div>
            <div className="mt-1 text-lg font-semibold">
              {avgWage30.toLocaleString(undefined, {
                style: "currency",
                currency: "USD",
              })}
            </div>
          </div>
        </div>

        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-900/60">
              <tr>
                <th className="p-2 text-left">Date</th>
                <th className="p-2 text-right">Hours</th>
                <th className="p-2 text-right">Wage (USD)</th>
                <th className="p-2 text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              {recentShifts30.map((s) => {
                const dt = new Date(s.occurred_at);
                const hours = Number(s.hours ?? 0);
                const wage = Number(s.wage_usd ?? 0);
                const cost = hours * wage;
                return (
                  <tr key={s.id} className="border-t">
                    <td className="p-2">
                      {dt.toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                    <td className="p-2 text-right">
                      {hours.toFixed(2)}
                    </td>
                    <td className="p-2 text-right">
                      {wage.toLocaleString(undefined, {
                        style: "currency",
                        currency: "USD",
                      })}
                    </td>
                    <td className="p-2 text-right">
                      {cost.toLocaleString(undefined, {
                        style: "currency",
                        currency: "USD",
                      })}
                    </td>
                  </tr>
                );
              })}
              {recentShifts30.length === 0 && (
                <tr>
                  <td className="p-3 text-neutral-400" colSpan={4}>
                    No labor shifts recorded for the last 30 days.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Roster table */}
      <section>
        <h2 className="text-lg font-semibold mb-2">Staff roster</h2>
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-900/60">
              <tr>
                <th className="p-2 text-left">Name</th>
                <th className="p-2 text-left">Role</th>
                <th className="p-2">Type</th>
                <th className="p-2 text-right">Rate (USD)</th>
                <th className="p-2 text-center">Active</th>
              </tr>
            </thead>
            <tbody>
              {emps.map((e) => (
                <tr key={e.id} className="border-t">
                  <td className="p-2">{e.display_name ?? "—"}</td>
                  <td className="p-2">{e.role ?? "—"}</td>
                  <td className="p-2 text-center">{e.pay_type ?? "—"}</td>
                  <td className="p-2 text-right">
                    {Number(e.pay_rate_usd ?? 0).toLocaleString(undefined, {
                      style: "currency",
                      currency: "USD",
                    })}
                  </td>
                  <td className="p-2 text-center">
                    {e.is_active ? "✓" : "—"}
                  </td>
                </tr>
              ))}
              {emps.length === 0 && (
                <tr>
                  <td className="p-3 text-neutral-400" colSpan={5}>
                    No employees yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
