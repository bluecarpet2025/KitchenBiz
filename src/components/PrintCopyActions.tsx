"use client";

import { useCallback, useState } from "react";
import createClient from "@/lib/supabase/client";

function randToken() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, b => b.toString(16).padStart(2, "0")).join("");
}

export default function PrintCopyActions() {
  const supabase = createClient();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const onPrint = useCallback(() => {
    window.print();
  }, []);

  const onCopy = useCallback(async () => {
    try {
      setBusy(true);
      setMsg(null);

      const search = new URLSearchParams(window.location.search);
      const menuId = search.get("menu_id");
      if (!menuId) throw new Error("Missing menu_id in URL.");

      // Auth + tenant
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) throw new Error("Sign in required.");

      const { data: prof } = await supabase
        .from("profiles")
        .select("tenant_id")
        .eq("id", uid)
        .maybeSingle();
      const tenantId = prof?.tenant_id as string | undefined;
      if (!tenantId) throw new Error("No tenant.");

      // Tenant – business fields
      const { data: t } = await supabase
        .from("tenants")
        .select("name, short_description")
        .eq("id", tenantId)
        .maybeSingle();
      const business_name = (t?.name ?? "").toString();
      const business_blurb = (t?.short_description ?? "").toString();

      // Menu name + items
      const { data: m } = await supabase
        .from("menus")
        .select("id,name,created_at")
        .eq("id", menuId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (!m) throw new Error("Menu not found.");

      const { data: lines } = await supabase
        .from("menu_recipes")
        .select("recipe_id,servings")
        .eq("menu_id", m.id);

      const recipeIds = (lines ?? []).map((r) => String(r.recipe_id));
      let namesById: Record<string, string> = {};
      if (recipeIds.length) {
        const { data: recs } = await supabase
          .from("recipes")
          .select("id,name")
          .in("id", recipeIds);
        namesById = Object.fromEntries((recs ?? []).map((r: any) => [String(r.id), r.name as string]));
      }

      const items = (lines ?? []).map((l: any) => ({
        name: namesById[String(l.recipe_id)] ?? "Item",
        servings: Number(l.servings ?? 1),
      }));

      // Build payload with business fields
      const payload = {
        name: (m.name ?? "Menu").toString(),
        created_at: m.created_at as string | undefined,
        items,
        business_name,
        business_blurb,
      };

      const token = randToken();
      const { error } = await supabase
        .from("menu_shares")
        .insert({
          tenant_id: tenantId,
          menu_id: m.id,
          token,
          payload,
        });
      if (error) throw error;

      const url = `${window.location.origin}/share/${token}`;
      await navigator.clipboard.writeText(url);
      setMsg("Link copied!");
      setTimeout(() => setMsg(null), 3000);
    } catch (e: any) {
      setMsg(e.message || "Failed to create share link.");
      setTimeout(() => setMsg(null), 5000);
    } finally {
      setBusy(false);
    }
  }, [supabase]);

  return (
    <div className="flex items-center gap-2">
      <button onClick={onPrint} className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
        Print
      </button>
      <button
        onClick={onCopy}
        disabled={busy}
        className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900 disabled:opacity-50"
      >
        {busy ? "Creating…" : "Copy link"}
      </button>
      {msg && <span className="text-xs opacity-80 ml-2">{msg}</span>}
    </div>
  );
}
