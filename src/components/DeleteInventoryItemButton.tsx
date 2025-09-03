// src/components/DeleteInventoryItemButton.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  // Preferred prop name:
  itemId?: string;
  // Back-compat: some places pass `id`
  id?: string;

  label?: string; // default "Delete"
  confirmText?: string; // default confirmation text
  className?: string;
};

export default function DeleteInventoryItemButton({
  itemId,
  id,
  label = "Delete",
  confirmText = "Delete this item? This cannot be undone.",
  className = "",
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const resolvedId = itemId ?? id ?? "";
  const disabled = isPending || !resolvedId;

  async function onClick() {
    setErr(null);
    if (!resolvedId) {
      setErr("Missing item id.");
      return;
    }
    if (!window.confirm(confirmText)) return;

    // Try DELETE first
    let res = await fetch(`/inventory/items/${resolvedId}/delete`, {
      method: "DELETE",
    });

    // Fallback to POST if needed (older route callers)
    if (!res.ok) {
      res = await fetch(`/inventory/items/${resolvedId}/delete`, {
        method: "POST",
      });
    }

    if (!res.ok) {
      const json = await res.json().catch(() => null);
      setErr(json?.error || "Failed to delete item.");
      return;
    }

    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className={className}>
      <button
        onClick={onClick}
        disabled={disabled}
        className="rounded-md border border-red-500 px-3 py-1 text-sm text-red-200 hover:bg-red-900/30 disabled:opacity-50"
        title="Delete item"
        aria-label="Delete item"
      >
        {isPending ? "Deleting..." : label}
      </button>
      {err ? (
        <p className="mt-1 text-xs text-red-400" role="alert">
          {err}
        </p>
      ) : null}
    </div>
  );
}
