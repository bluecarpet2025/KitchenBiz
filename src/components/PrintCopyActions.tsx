// src/components/PrintCopyActions.tsx
"use client";

import { useState } from "react";

export default function PrintCopyActions({ menuId }: { menuId: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function copyLink() {
    try {
      setBusy(true);
      setMsg(null);

      // Create or fetch a share token for this menu via your existing API route.
      // (This matches the behavior you already had that fixed the duplicate-key issue.)
      const res = await fetch(`/api/menu/share?menu_id=${encodeURIComponent(menuId)}`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(await res.text());
      const { token } = await res.json();

      const params = new URLSearchParams(window.location.search);
      const margin = params.get("margin") ?? "0.3";
      const url = `${window.location.origin}/share/${token}?margin=${margin}`;

      await navigator.clipboard.writeText(url);
      setMsg("Link copied ✓");
      setTimeout(() => setMsg(null), 3000);
    } catch (e: any) {
      setMsg(e?.message || "Failed to copy link.");
      setTimeout(() => setMsg(null), 4000);
    } finally {
      setBusy(false);
    }
  }

  function doPrint() {
    // ✅ No navigation, no new page—just open the native print dialog
    window.print();
  }

  return (
    <div className="flex items-center gap-3">
      <button
        disabled={busy}
        onClick={doPrint}
        className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
      >
        Print
      </button>
      <button
        disabled={busy}
        onClick={copyLink}
        className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
      >
        Copy link
      </button>
      {msg && <span className="text-xs opacity-70">{msg}</span>}
    </div>
  );
}
