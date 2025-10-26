import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { getEffectiveTenant } from "@/lib/effective-tenant";

export const dynamic = "force-dynamic";

export default async function ImportReceiptsUploadPage() {
  const supabase = await createServerClient();
  const { data: u } = await supabase.auth.getUser();
  const user = u.user ?? null;

  if (!user) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Import receipts (CSV)</h1>
        <p className="mt-4">Sign in required.</p>
        <Link className="underline" href="/login?redirect=/inventory/receipts/upload">
          Go to login
        </Link>
      </main>
    );
  }

  const tenantId = await getEffectiveTenant(supabase);
  if (!tenantId) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Import receipts (CSV)</h1>
        <p className="mt-4">Profile missing tenant.</p>
      </main>
    );
  }

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Import receipts (CSV)</h1>
        <div className="flex gap-2">
          <Link
            href="/inventory/receipts"
            prefetch={false}
            className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
          >
            Back to Receipts
          </Link>
          <Link
            href="/inventory/receipts/import/template"
            prefetch={false}
            className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
          >
            Download template
          </Link>
        </div>
      </div>

      <section className="space-y-3">
        <p className="opacity-80">
          Upload a CSV with the columns <code className="px-1 rounded bg-neutral-900">item</code>,{" "}
          <code className="px-1 rounded bg-neutral-900">qty</code>,{" "}
          <code className="px-1 rounded bg-neutral-900">unit</code>,{" "}
          <code className="px-1 rounded bg-neutral-900">cost_total</code>.
        </p>

        <div className="border rounded-lg p-4">
          <form
            action="/inventory/receipts/import"
            method="POST"
            encType="multipart/form-data"
            className="space-y-4"
          >
            <div>
              <label htmlFor="file" className="block text-sm mb-1">
                Choose CSV file
              </label>
              <input
                id="file"
                name="file"
                type="file"
                accept=".csv,text/csv"
                required
                className="block w-full text-sm file:mr-4 file:rounded-md file:border file:px-3 file:py-2 file:bg-neutral-950 file:hover:bg-neutral-900"
              />
            </div>
            <button
              type="submit"
              className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
              title="Upload CSV"
            >
              Upload CSV
            </button>
          </form>
        </div>

        <div className="text-xs opacity-75">
          <p className="mb-2">Example (first few rows):</p>
          <pre className="overflow-auto p-3 rounded bg-neutral-950 border">
item,qty,unit,cost_total
Mozzarella,90000,g,672.00
Flour (00),900000,g,636.00
Tomato sauce,18000,ml,96.00
          </pre>
        </div>
      </section>
    </main>
  );
}
