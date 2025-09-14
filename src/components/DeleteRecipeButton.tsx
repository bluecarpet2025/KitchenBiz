"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function DeleteRecipeButton({
  id,
  redirectTo,
  label = "Delete",
}: {
  id: string;
  redirectTo?: string; // e.g. "/recipes"
  label?: string;
}) {
  const [busy, setBusy] = useState(false);

  async function onDelete() {
    if (!id) return;
    const ok = window.confirm(
      "This will permanently delete the recipe and its ingredient lines and remove it from any menus. This cannot be undone.\n\nProceed?"
    );
    if (!ok) return;

    try {
      setBusy(true);
      const { error } = await supabase.from("recipes").delete().eq("id", id);
      if (error) throw error;

      if (redirectTo) {
        window.location.assign(redirectTo);
      } else {
        window.location.reload();
      }
    } catch (e: any) {
      alert(e?.message ?? "Failed to delete recipe");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={onDelete}
      disabled={busy}
      className="px-3 py-2 border rounded-md text-sm hover:bg-red-900/20 disabled:opacity-50"
      title="Delete recipe"
    >
      {busy ? "Deleting…" : label}
    </button>
  );
}
