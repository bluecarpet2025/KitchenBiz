import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { getEffectiveTenant } from "@/lib/effective-tenant";
import SalesEditorClient from "@/components/SalesEditorClient";

export const dynamic = "force-dynamic";

export default async function SalesManagePage() {
  const supabase = await createServerClient();
  const tenantId = await getEffectiveTenant(supabase);

  if (!tenantId) {
    return (
      <main className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Sales</h1>
        <p className="mt-2 text-neutral-400">Profile missing tenant.</p>
      </main>
    );
  }

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Manage Sales</h1>
        <div className="flex items-center gap-2">
          <Link href="/sales" className="px-3 py-2 border rounded hover:bg-neutral-900 text-sm">
            Back to Sales
          </Link>
        </div>
      </div>
      <SalesEditorClient tenantId={tenantId} />
    </main>
  );
}
