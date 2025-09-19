import Link from "next/link";

export const dynamic = "force-dynamic";

export default function ImportExpensesPage() {
  return (
    <main className="max-w-3xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Import Expenses (CSV)</h1>
        <Link
          href="/expenses"
          className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
        >
          Back to Expenses
        </Link>
      </div>

      <div className="border rounded-lg p-4">
        <p className="text-sm opacity-80 mb-3">
          CSV columns supported (header row required):{" "}
          <code>date, category, description, amount</code>.
        </p>

        <div className="flex items-center gap-2 mb-4">
          <Link
            href="/expenses/template"
            className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
          >
            Download template
          </Link>
        </div>

        <form
          action="/expenses/import"
          method="post"
          encType="multipart/form-data"
          className="space-y-3"
        >
          <div className="text-sm">
            <label className="block mb-1">Choose CSV file</label>
            <input
              type="file"
              name="file"
              accept=".csv,text/csv"
              required
              className="block w-full"
            />
          </div>
          <button
            type="submit"
            className="px-3 py-2 bg-white text-black rounded text-sm font-medium"
          >
            Upload CSV
          </button>
        </form>
      </div>
    </main>
  );
}
