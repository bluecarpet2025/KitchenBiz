"use client";

import { useMemo, useState } from "react";

type Props = {
  /** The menus.id to act on */
  menuId: string;
};

/**
 * Buttons shown on /menu/share that:
 * - open the centered /menu/print view
 * - copy a public /share/{token} link (creates or reuses a token)
 */
export default function PrintCopyActions({ menuId }: Props) {
  const [busy, setBusy] = useState(false);
  const margin = useMemo(() => {
    const sp = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    const m = Number(sp.get("margin"));
    const clamped = Number.isFinite(m) ? Math.max(0, Math.min(0.9, m)) : 0.3;
    return clamped;
  }, []);

  const doPrint = () => {
    window.open(`/menu/print?menu_id=${encodeURIComponent(menuId)}&margin=${margin}`, "_blank");
  };

  const copyPublicLink = async () => {
    try {
      setBusy(true);
      const res = await fetch("/api/menu/share", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ menu_id: menuId }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { token } = await res.json();
      const url = `${location.origin}/share/${encodeURIComponent(token)}?margin=${margin}`;
      await navigator.clipboard.writeText(url);
      alert("Share link copied!");
    } catch (e: any) {
      alert(e?.message || "Failed to copy link.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button onClick={doPrint} className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
        Print
      </button>
      <button
        onClick={copyPublicLink}
        disabled={busy}
        className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900 disabled:opacity-50"
      >
        {busy ? "Copying…" : "Copy link"}
      </button>
    </div>
  );
}
