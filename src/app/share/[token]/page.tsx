// src/app/share/[token]/page.tsx
import { createServerClient } from "@/lib/supabase/server";
import Link from "next/link";

export const dynamic = "force-dynamic";

type ShareRow = {
  token: string;
  payload: {
    name: string;
    created_at?: string;
    items: { name: string; servings: number }[];
  } | null;
};

export default async function PublicSharePage(
  { params }: { params: { token: string } }
) {
  const supabase = await createServerClient();

  // Public view: just read the shared payload
  const { data: share, error } = await supabase
    .from("menu_shares")
    .select("token,payload")
    .eq("token", params.token)
    .maybeSingle();

  if (error) {
    return (
      <main className="max-w-3xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Shared Menu</h1>
        <p className="mt-4 text-red-300">Error loading share.</p>
        <Link className="underline" href="/">Home</Link>
      </main>
    );
  }

  const payload = (share as ShareRow | null)?.payload;

  if (!payload) {
    return (
      <main className="max-w-3xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Shared Menu</h1>
        <p className="mt-4">This share link is invalid or has been revoked.</p>
        <Link className="underline" href="/">Home</Link>
      </main>
    );
  }

  return (
    <main className="mx-auto p-8 max-w-3xl">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold">{payload.name || "Menu"}</h1>
        {payload.created_at && (
          <p className="text-sm opacity-80">
            Created {new Date(payload.created_at).toLocaleString()}
          </p>
        )}
      </div>

      <div className="border rounded-lg p-6">
        <ol className="space-y-2 list-decimal pl-6">
          {payload.items?.length ? (
            payload.items.map((it, i) => (
              <li key={i} className="flex justify-between">
                <span>{it.name}</span>
                <span className="tabular-nums">{it.servings}</span>
              </li>
            ))
          ) : (
            <li className="text-neutral-400 list-none">No items in this menu.</li>
          )}
        </ol>
      </div>
    </main>
  );
}
