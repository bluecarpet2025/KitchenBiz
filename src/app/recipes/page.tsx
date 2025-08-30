import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { getEffectiveTenant } from "@/lib/effective-tenant";

export const dynamic = "force-dynamic";

export default async function RecipesPage() {
  const supabase = await createServerClient();
  const tenantId = await getEffectiveTenant(supabase);
  if (!tenantId) redirect("/login");

  const { data: recipes } = await supabase
    .from("recipes")
    .select("id,name,base_unit,yield_base,created_at")
    .eq("tenant_id", tenantId)
    .order("name");

  return (
    <main className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold mb-6">Recipes</h1>

      <div className="rounded-lg border border-neutral-800 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-neutral-300">
            <tr className="border-b border-neutral-800">
              <th className="text-left p-3">Name</th>
              <th className="text-left p-3">Base unit</th>
              <th className="text-left p-3">Yield (base)</th>
              <th className="text-left p-3">Created</th>
            </tr>
          </thead>
          <tbody>
            {(recipes ?? []).map((r) => (
              <tr key={r.id} className="border-b border-neutral-900">
                <td className="p-3">{r.name}</td>
                <td className="p-3">{r.base_unit}</td>
                <td className="p-3">{r.yield_base ?? "—"}</td>
                <td className="p-3">
                  {r.created_at
                    ? new Date(r.created_at).toLocaleDateString()
                    : "—"}
                </td>
              </tr>
            ))}
            {(!recipes || recipes.length === 0) && (
              <tr>
                <td className="p-4 text-neutral-400" colSpan={4}>
                  No recipes yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-6">
        <Link href="/recipes/new" className="underline underline-offset-4">
          New recipe →
        </Link>
      </div>
    </main>
  );
}
