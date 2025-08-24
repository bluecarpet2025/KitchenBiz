"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeleteRecipeButton({
  recipeId,
  redirectTo = "/recipes",
}: {
  recipeId: string;
  redirectTo?: string;
}) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function onClick() {
    if (busy) return;
    const ok = window.confirm("Delete this recipe? This cannot be undone.");
    if (!ok) return;

    try {
      setBusy(true);
      const res = await fetch(`/recipes/${recipeId}/delete`, { method: "POST" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j?.error || "Delete failed");
        setBusy(false);
        return;
      }
      router.push(redirectTo);
    } catch (e: any) {
      alert(e?.message || "Network error");
      setBusy(false);
    }
  }

  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="px-3 py-1.5 border rounded-md text-sm hover:bg-red-950 text-red-300 disabled:opacity-50"
      title="Delete recipe"
    >
      {busy ? "Deleting…" : "Delete"}
    </button>
  );
}
