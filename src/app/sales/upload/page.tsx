// src/app/sales/upload/page.tsx
import Link from "next/link";
import SalesCsvUploadClient from "@/components/SalesCsvUploadClient";
import { createServerClient } from "@/lib/supabase/server";
import { getEffectiveTenant } from "@/lib/effective-tenant";
export const dynamic = "force-dynamic";

export default async function SalesUploadPage() {
  const supabase = await createServerClient();
  const tenantId = await getEffectiveTenant(supabase);

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Import Sales CSV</h1>
        <Link href="/sales/import/template" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
          Download template
        </Link>
      </div>
      <p className="text-sm opacity-80">
        CSV columns: <code>occurred_at, source, channel, order_ref, product_name, qty, unit_price</code>.
        <br />Date should be ISO or <code>YYYY-MM-DD</code>. Use <code>order_ref</code> to group lines for the same order.
      </p>
      <SalesCsvUploadClient tenantId={tenantId ?? ""} />
    </main>
  );
}
