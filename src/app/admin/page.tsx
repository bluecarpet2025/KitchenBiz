// src/app/admin/page.tsx
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // allow only owners
  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (me?.role !== "owner") redirect("/");

  const { data: feedback } = await supabase
    .from("admin_feedback_v")
    .select("*");

  const { data: profiles } = await supabase
    .from("admin_profiles_v")
    .select("*");

  return (
    <main className="max-w-5xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-4">Admin dashboard</h1>

      <section className="mb-10">
        <h2 className="text-lg font-semibold mb-2">Feedback / signups</h2>
        <div className="overflow-x-auto border border-neutral-800 rounded-md">
          <table className="min-w-full text-sm">
            <thead className="bg-neutral-900">
              <tr>
                <th className="text-left p-2">Created</th>
                <th className="text-left p-2">Email</th>
                <th className="text-left p-2">Note</th>
              </tr>
            </thead>
            <tbody>
              {feedback?.map((r) => (
                <tr key={r.id} className="border-t border-neutral-800">
                  <td className="p-2">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="p-2">{r.email}</td>
                  <td className="p-2">{r.note}</td>
                </tr>
              )) || null}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">Profiles</h2>
        <div className="overflow-x-auto border border-neutral-800 rounded-md">
          <table className="min-w-full text-sm">
            <thead className="bg-neutral-900">
              <tr>
                <th className="text-left p-2">Created</th>
                <th className="text-left p-2">User ID</th>
                <th className="text-left p-2">Display name</th>
                <th className="text-left p-2">Use demo</th>
              </tr>
            </thead>
            <tbody>
              {profiles?.map((p) => (
                <tr key={p.id} className="border-t border-neutral-800">
                  <td className="p-2">
                    {p.created_at ? new Date(p.created_at).toLocaleString() : "—"}
                  </td>
                  <td className="p-2">{p.id}</td>
                  <td className="p-2">{p.display_name || "—"}</td>
                  <td className="p-2">{p.use_demo ? "yes" : "no"}</td>
                </tr>
              )) || null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
