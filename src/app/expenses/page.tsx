import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { getEffectiveTenant } from "@/lib/effective-tenant";

export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams?: Promise<Search>;
}) {
  const sp = (await searchParams) ?? {};
  const flash = typeof sp.flash === "string" ? decodeURIComponent(sp.flash) : null;

  const supabase = await createServerClient();
  const tenantId = await getEffectiveTenant(supabase);

  // … your existing queries/aggregations …

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Expenses</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/expenses/manage"
            className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
          >
            Manage
          </Link>
          <Link
            href="/expenses/import"
            className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
          >
            Import CSV
          </Link>
          <Link
            href="/expenses/template"
            className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
          >
            Download template
          </Link>
        </div>
      </div>

      {flash && (
        <div className="border rounded-md p-3 bg-neutral-900/40 text-sm">
          {flash}
        </div>
      )}

      {/* the rest of your existing totals UI */}
    </main>
  );
}
