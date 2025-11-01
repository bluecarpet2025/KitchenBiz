import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { getEffectiveTenant } from "@/lib/effective-tenant";
import { effectivePlan, canUseFeature } from "@/lib/plan";

export const dynamic = "force-dynamic";

export default async function SalesImportPage() {
  const supabase = await createServerClient();
  const tenantId = await getEffectiveTenant(supabase);

  // 🧩 GATE-KEEPING
  const plan = await effectivePlan();
  const canAccessSales = canUseFeature(plan, "sales_access");
  if (!canAccessSales) {
    return (
      <main className="max-w-3xl mx-auto p-6 text-center">
        <h1 className="text-2xl font-semibold mb-2">Sales Import</h1>
        <p className="text-neutral-400">Your current plan doesn’t include Sales features.</p>
        <p className="mt-2">
          <Link href="/profile" className="text-blue-400 hover:underline">
            Upgrade your plan →
          </Link>
        </p>
      </main>
    );
  }

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Sales Import</h1>
      <p className="text-sm opacity-80">
        Download the CSV template and upload completed files on the upload page.
      </p>
      <div className="flex gap-2">
        <Link
          href="/sales/import/template"
          className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
        >
          Download template
        </Link>
        <Link
          href="/sales/upload"
          className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
        >
          Go to upload
        </Link>
      </div>
    </main>
  );
}
