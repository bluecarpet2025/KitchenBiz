import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { getEffectiveTenant } from "@/lib/effective-tenant";
import ExpensesEditorClient from "@/components/ExpensesEditorClient";

export const dynamic = "force-dynamic";

export default async function ExpensesManagePage() {
  const supabase = await createServerClient();
  const tenantId = await getEffectiveTenant(supabase);

  if (!tenantId) {
    return (
      <main className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Expenses</h1>
        <p className="mt-2 text-neutral-400">Profile missing tenant.</p>
      </main>
    );
  }

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Manage Expenses</h1>
        <Link href="/expenses" className="px-3 py-2 border rounded hover:bg-neutral-900 text-sm">
          Back to Expenses
        </Link>
      </div>
      <ExpensesEditorClient tenantId={tenantId} />
    </main>
  );
}
