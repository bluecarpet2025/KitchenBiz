// src/components/DeleteInventoryItemButton.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  itemId: string;
  label?: string; // default "Delete"
  confirmText?: string; // default "Delete this item? This cannot be undone."
  className?: string;
};

export default function DeleteInventoryItemButton({
  itemId,
  label = "Delete",
  confirmText = "Delete this item? This cannot be undone.",
  className = "",
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  async function onClick() {
    setErr(null);
    if (!window.confirm(confirmText)) return;

    const res = await fetch(`/inventory/items/${itemId}/delete`, {
      method: "DELETE",
    });

    if (!res.ok) {
      // if the route only allowed POST in older code, try POST once for safety
      const retry = await fetch(`/inventory/items/${itemId}/delete`, {
        method: "POST",
      });
      if (!retry.ok) {
        const msg =
          (await retry.json().catch(() => null))?.error ??
          (await res.json().catch(() => null))?.error ??
          "Failed to delete item.";
        setErr(msg);
        return;
      }
    }

    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className={className}>
      <button
        onClick={onClick}
        disabled={pending}
        className="rounded-md border border-red-500 px-3 py-1 text-sm text-red-200 hover:bg-red-900/30 disabled:opacity-50"
        title="Delete item"
        aria-label="Delete item"
      >
        {pending ? "Deleting…" : label}
      </button>
      {err ? (
        <p className="mt-1 text-xs text-red-400" role="alert">
          {err}
        </p>
      ) : null}
    </div>
  );
}
