"use client";
import { supabase } from "@/lib/supabase";
import { useState } from "react";

export default function ArchiveRecipeButton({
  recipeId,
  onArchived,
}: { recipeId: string; onArchived?: () => void }) {
  const [busy, setBusy] = useState(false);

  async function archive() {
    if (!window.confirm("Archive this recipe? (You can restore later)")) return;
    try {
      setBusy(true);
      const { error } = await supabase
        .from("recipes")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", recipeId);
      if (error) throw error;
      onArchived?.();
    } catch (e: any) {
      alert(e.message ?? "Archive failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button disabled={busy} onClick={archive} className="text-xs underline" title="Archive">
      Archive
    </button>
  );
}
