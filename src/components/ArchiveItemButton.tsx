"use client";
import { supabase } from "@/lib/supabase";
import { useState } from "react";

export default function ArchiveItemButton({
  itemId,
  onArchived,
}: { itemId: string; onArchived?: () => void }) {
  const [busy, setBusy] = useState(false);

  async function archive() {
    if (!itemId) return;
    if (!window.confirm("Archive this inventory item?")) return;
    try {
      setBusy(true);
      const { error } = await supabase
        .from("inventory_items")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", itemId);
      if (error) throw error;
      onArchived?.();
    } catch (e: any) {
      alert(e.message ?? "Archive failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      disabled={busy}
      onClick={archive}
      className="text-xs underline"
      title="Archive item"
    >
      Archive
    </button>
  );
}
