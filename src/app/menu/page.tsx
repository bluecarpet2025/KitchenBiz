import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { getEffectiveTenant } from "@/lib/effective-tenant";

export const dynamic = "force-dynamic";

export default async function MenuPage() {
  const supabase = await createServerClient();
  const tenantId = await getEffectiveTenant(supabase);
  if (!tenantId) redirect("/login");

  const { data: menus } = await supabase
    .from("saved_menus")
    .select("id,name,note,created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  return (
    <main className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold mb-6">Menu</h1>

      <div className="grid gap-3">
        {(menus ?? []).map((m) => (
          <div
            key={m.id}
            className="rounded-lg border border-neutral-800 p-4 flex items-center justify-between"
          >
            <div>
              <div className="font-medium">{m.name}</div>
              <div className="text-sm text-neutral-400">
                {m.note ?? "—"}{" "}
                {m.created_at
                  ? `• ${new Date(m.created_at).toLocaleDateString()}`
                  : ""}
              </div>
            </div>
            {/* Link target depends on your existing route for opening a menu */}
            <a
              href={`/menu/${m.id}`}
              className="text-sm underline underline-offset-4"
            >
              Open →
            </a>
          </div>
        ))}
        {(!menus || menus.length === 0) && (
          <div className="text-neutral-400">No menus yet.</div>
        )}
      </div>
    </main>
  );
}
