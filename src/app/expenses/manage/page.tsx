import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { effectiveTenantId } from "@/lib/effective-tenant";
import ExpensesEditorClient from "@/components/ExpensesEditorClient";

export default async function ExpensesManagePage() {
  // Keep SSR client initialization (used elsewhere on page as needed)
  const _supabase = await createServerClient();

  // New helper takes NO arguments
  const { tenantId, useDemo } = await effectiveTenantId();

  return (
    <main className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2">
          <Link href="/expenses" className="rounded border px-3 py-1 hover:bg-neutral-900 text-sm">
            Back to expenses
          </Link>
          <Link href="/expenses/import" className="rounded border px-3 py-1 hover:bg-neutral-900 text-sm">
            Import CSV
          </Link>
        </div>
        <div className="text-sm opacity-80">Expenses · Manage</div>
      </div>

      {useDemo && (
        <div className="mb-4 rounded border border-emerald-700 bg-neutral-900/40 px-3 py-2 text-sm">
          Demo mode is <b>read-only</b>. Turn off “Use demo data” in your profile to add or edit expenses.
        </div>
      )}

      {!tenantId ? (
        <div className="rounded border px-3 py-4 text-sm">
          You’re not signed in or don’t have a tenant set up yet. Please sign in and complete your profile.
        </div>
      ) : (
        // NOTE: ExpensesEditorClient historically accepts a string tenantId.
        // Pass the resolved id only when available to avoid type/runtime issues.
        <ExpensesEditorClient tenantId={tenantId} />
      )}
    </main>
  );
}
