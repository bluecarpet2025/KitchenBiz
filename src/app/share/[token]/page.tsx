import { createServerClient } from "@/lib/supabase/server";
import Link from "next/link";

export const dynamic = "force-dynamic";

type PayloadItem = { name: string; servings: number };
type SharePayload = {
  name: string;                 // menu name
  created_at?: string;
  items: PayloadItem[];
  business_name?: string;       // NEW
  business_blurb?: string;      // NEW
};

export default async function PublicSharePage(
  props: { params?: Promise<{ token: string }> }
) {
  const { token } = (await props.params) ?? { token: "" };
  const supabase = await createServerClient();

  const { data: share } = await supabase
    .from("menu_shares")
    .select("payload")
    .eq("token", token)
    .maybeSingle();

  const payload = (share?.payload ?? null) as SharePayload | null;

  if (!payload) {
    return (
      <main className="max-w-3xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Shared Menu</h1>
        <p className="mt-4">This share link is invalid or has been revoked.</p>
        <Link className="underline" href="/">Home</Link>
      </main>
    );
  }

  const business = (payload.business_name ?? "").trim();
  const blurb = (payload.business_blurb ?? "").trim();
  const showCreated = !blurb && payload.created_at;

  return (
    <main className="mx-auto p-8 max-w-3xl">
      <div className="mb-4">
        {business && <div className="text-xl font-semibold">{business}</div>}
        {blurb && <p className="text-sm opacity-80 mt-0.5">{blurb}</p>}
        <h1 className="text-2xl font-semibold">{payload.name || "Menu"}</h1>
        {showCreated && (
          <p className="text-sm opacity-80">
            Created {new Date(payload.created_at!).toLocaleString()}
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
