import Link from "next/link";
import { effectivePlan, canUseFeature } from "@/lib/plan"; // 🆕

export default function StaffImportPage() {
  return (
    <main className="max-w-4xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Import Staff (CSV)</h1>
        <Link
          href="/staff"
          className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
        >
          Back to Staff
        </Link>
      </div>

      <div className="border rounded-lg p-4 space-y-4">
        <p className="opacity-80 text-sm">
          CSV columns supported (header row required):{" "}
          <code>first_name, last_name, email, phone, role, pay_type, pay_rate_usd, hire_date, end_date, is_active, notes</code>
        </p>

        <div className="flex gap-2">
          <Link
            href="/staff/import/template"
            className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
            prefetch={false}
          >
            Download template
          </Link>
        </div>

        <form
          action="/staff/import/commit"
          method="post"
          encType="multipart/form-data"
          className="space-y-3"
        >
          <input
            required
            name="file"
            type="file"
            accept=".csv,text/csv"
            className="block"
          />
          <button className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
            Upload CSV
          </button>
        </form>
      </div>
    </main>
  );
}

