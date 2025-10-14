// src/app/expenses/manage/page.tsx
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { effectiveTenantId } from "@/lib/effective-tenant";
import ExpensesEditorClient from "./ExpensesEditorClient";

export const dynamic = "force-dynamic";

export default async function ExpensesManagePage() {
  const supabase = await createServerClient();
  const { tenantId, useDemo } = await effectiveTenantId(supabase);

  return (
    <main className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Expenses — Manage</h1>
        <div className="flex gap-2">
          <Link href="/expenses" className="rounded border px-3 py-1 hover:bg-neutral-900 text-sm">
            Back to Expenses
          </Link>
          <Link href="/expenses/import" className="rounded border px-3 py-1 hover:bg-neutral-900 text-sm">
            Import CSV
          </Link>
        </div>
      </div>

      {useDemo && (
        <div className="mb-4 text-sm rounded border border-amber-600/40 bg-amber-950/30 px-3 py-2">
          You are viewing <strong>demo data (read-only)</strong>. Uploads and edits should be disabled in the UI.
        </div>
      )}

      {/* IMPORTANT: pass a string to the client component */}
      <ExpensesEditorClient tenantId={tenantId ?? ""} readOnly={useDemo} />
    </main>
  );
}
