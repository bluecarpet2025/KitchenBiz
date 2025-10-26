import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { getEffectiveTenant } from "@/lib/effective-tenant";
import { effectivePlan, canUseFeature } from "@/lib/plan"; // 🆕 Added import

export const dynamic = "force-dynamic";

type Emp = {
  id: string;
  display_name: string | null;
  role: string | null;
  pay_type: string | null;
  pay_rate_usd: number | null;
  is_active: boolean | null;
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

  // 🆕 Get user plan and enforce access
  const plan = await effectivePlan();
  if (!canUseFeature(plan, "staff_accounts")) {
    return (
      <main className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-semibold mb-3">Upgrade Required</h1>
        <p className="opacity-80">
          The Staff module is available starting with the{" "}
          <strong>Basic plan</strong>.
        </p>
        <p className="mt-3">
          <Link href="/profile" className="underline">
            Go to Profile
          </Link>{" "}
          to upgrade your plan.
        </p>
      </main>
    );
  }

  const tenantId = await getEffectiveTenant(supabase);
  if (!tenantId) {
    return (
      <main className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Staff</h1>
        <p className="mt-3">Profile missing tenant.</p>
      </main>
    );
  }

  const { data: rows } = await supabase
    .from("employees")
    .select("id, display_name, role, pay_type, pay_rate_usd, is_active")
    .eq("tenant_id", tenantId)
    .order("display_name", { ascending: true });

  const emps = (rows ?? []) as Emp[];

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-4">
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
                  {(Number(e.pay_rate_usd ?? 0)).toLocaleString(undefined, { style: "currency", currency: "USD" })}
                </td>
                <td className="p-2 text-center">{e.is_active ? "✓" : "—"}</td>
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
    </main>
  );
}
 