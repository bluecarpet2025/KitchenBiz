import Link from "next/link";

export const dynamic = "force-dynamic";

export default function ExpensesImportPage() {
  return (
    <main className="max-w-3xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Import Expenses (CSV)</h1>
        <Link href="/expenses" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
          Back to Expenses
        </Link>
      </div>

      <div className="border rounded-lg p-4 space-y-4">
        <p className="text-sm opacity-80">
          CSV columns supported (header row required): <code>date</code>, <code>category</code>,{" "}
          <code>description</code>, <code>amount</code>.
        </p>
        <div className="flex gap-2">
          <Link href="/expenses/import/template" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
            Download template
          </Link>
        </div>

        {/* NOTE: action points to /expenses/import/commit now */}
        <form method="post" action="/expenses/import/commit" encType="multipart/form-data" className="space-y-3">
          <input type="file" name="file" accept=".csv,text/csv" className="block" required />
          <button className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900" type="submit">
            Upload CSV
          </button>
        </form>
      </div>
    </main>
  );
}
