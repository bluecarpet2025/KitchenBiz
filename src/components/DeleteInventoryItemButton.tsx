// src/components/DeleteInventoryItemButton.tsx
"use client";
import * as React from "react";

export default function DeleteInventoryItemButton({ id }: { id: string }) {
  const [busy, setBusy] = React.useState(false);
  return (
    <button
      className="text-red-400 hover:underline"
      onClick={async () => {
        if (!confirm("Delete this item? This hides it from lists.")) return;
        setBusy(true);
        const res = await fetch(`/inventory/items/${id}/delete`, { method: "POST" });
        setBusy(false);
        if (res.ok) location.reload();
        else alert("Delete failed");
      }}
      disabled={busy}
    >
      {busy ? "Deleting…" : "Delete"}
    </button>
  );
}
