"use client";
import { supabase } from "@/lib/supabase";
import { useState } from "react";

export default function DeleteMenuButton({
  menuId,
  onDeleted,
}: { menuId: string; onDeleted?: () => void }) {
  const [busy, setBusy] = useState(false);

  async function doDelete() {
    if (!menuId) return;
    const ok = window.confirm("Delete this menu and its lines?");
    if (!ok) return;
    try {
      setBusy(true);
      await supabase.from("menu_recipes").delete().eq("menu_id", menuId);
      const { error } = await supabase.from("menus").delete().eq("id", menuId);
      if (error) throw error;
      onDeleted?.();
    } catch (e: any) {
      alert(e.message ?? "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      disabled={busy}
      onClick={doDelete}
      className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
      title="Delete this menu"
    >
      Delete
    </button>
  );
}
