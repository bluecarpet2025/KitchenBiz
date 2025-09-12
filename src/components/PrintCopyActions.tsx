"use client";

import { useState } from "react";
import createClient from "@/lib/supabase/client";

type Props = {
  menuId: string;
  /** Optional – shown nowhere, but included in payload for the public page */
  businessName?: string | null;
  businessTagline?: string | null;
};

export default function PrintCopyActions({ menuId, businessName, businessTagline }: Props) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function toast(m: string) {
    setMsg(m);
    setTimeout(() => setMsg(null), 2500);
  }

  async function onCopyLink() {
    try {
      setBusy(true);
      const supabase = createClient();

      // who am I / tenant
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("Not signed in.");

      const { data: prof, error: pErr } = await supabase
        .from("profiles")
        .select("tenant_id,business_name,business_tagline")
        .eq("id", uid)
        .maybeSingle();
      if (pErr) throw pErr;
      const tenantId = prof?.tenant_id as string;

      // Get menu name (for title on shared page)
      const { data: menu, error: mErr } = await supabase
        .from("menus")
        .select("id,name,created_at")
        .eq("id", menuId)
        .maybeSingle();
      if (mErr) throw mErr;

      // Build simple items payload for the public page (name + servings)
      const { data: lines, error: lErr } = await supabase
        .from("menu_recipes")
        .select("recipe_id,servings")
        .eq("menu_id", menuId);
      if (lErr) throw lErr;

      let items: Array<{ name: string; servings: number }> = [];
      if (lines?.length) {
        const rids = lines.map(l => String(l.recipe_id));
        const { data: recs, error: rErr } = await supabase
          .from("recipes")
          .select("id,name")
          .in("id", rids);
        if (rErr) throw rErr;
        const nameById = new Map<string, string>();
        (recs ?? []).forEach(r => nameById.set(String(r.id), String(r.name ?? "Untitled")));
        items = (lines ?? []).map(l => ({
          name: nameById.get(String(l.recipe_id)) ?? "Untitled",
          servings: Number(l.servings ?? 1),
        }));
      }

      // If a share for this menu already exists, reuse it; otherwise create it.
      const { data: existing, error: exErr } = await supabase
        .from("menu_shares")
        .select("id, token")
        .eq("menu_id", menuId)
        .maybeSingle();
      if (exErr) throw exErr;

      let token = existing?.token as string | undefined;
      if (!token) {
        token = crypto.randomUUID().replace(/-/g, "");
      }

      const payload = {
        name: String(menu?.name ?? "Menu"),
        created_at: menu?.created_at ?? new Date().toISOString(),
        business: {
          name: businessName ?? prof?.business_name ?? null,
          tagline: businessTagline ?? prof?.business_tagline ?? null,
        },
        items,
      };

      // UPSERT on menu_id to avoid “duplicate key value violates … menu_id …”.
      const { error: upErr } = await supabase
        .from("menu_shares")
        .upsert(
          [{ tenant_id: tenantId, menu_id: menuId, token, payload }],
          { onConflict: "menu_id" }
        );
      if (upErr) throw upErr;

      const url = `${window.location.origin}/share/${token}`;
      await navigator.clipboard.writeText(url);
      toast("Share link copied!");
    } catch (e: any) {
      console.error(e);
      toast(e?.message || "Copy failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => window.print()}
        className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
      >
        Print
      </button>
      <button
        type="button"
        onClick={onCopyLink}
        disabled={busy}
        className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900 disabled:opacity-50"
      >
        {busy ? "Copying…" : "Copy link"}
      </button>
      {msg && <span className="text-xs opacity-75">{msg}</span>}
    </div>
  );
}
