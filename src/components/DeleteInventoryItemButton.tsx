"use client";
import { useRouter } from "next/navigation";

export default function DeleteInventoryItemButton({ id }: { id: string }) {
  const r = useRouter();

  async function onDel() {
    if (!confirm("Delete this item? This hides it from lists.")) return;

    const res = await fetch(`/inventory/items/${id}/delete`, { method: "POST" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j?.error || "Delete failed");
      return;
    }
    r.refresh();
  }

  return (
    <button className="text-red-400 hover:underline text-xs" onClick={onDel}>
      Delete
    </button>
  );
}
