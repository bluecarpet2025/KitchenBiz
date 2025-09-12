"use client";

import { useState } from "react";

type Props = {
  menuId: string;
  margin: number; // 0..1
};

export default function PrintCopyActions({ menuId, margin }: Props) {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function doCopyLink() {
    try {
      setBusy(true);
      setMsg(null);

      const res = await fetch(`/api/menu/shares?menu_id=${encodeURIComponent(menuId)}`, {
        method: "POST",
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Share failed");
      }
      const { token } = (await res.json()) as { token: string };
      const url = `${location.origin}/share/${encodeURIComponent(token)}?margin=${margin}`;
      await navigator.clipboard.writeText(url);
      setMsg("Link copied ✓");
    } catch (e: any) {
      setMsg(e?.message || "Copy failed");
    } finally {
      setBusy(false);
      setTimeout(() => setMsg(null), 3000);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => window.print()}
        className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
      >
        Print
      </button>
      <button
        disabled={busy}
        onClick={doCopyLink}
        className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900 disabled:opacity-60"
      >
        {busy ? "…" : "Copy link"}
      </button>
      {msg && <span className="text-xs opacity-70">{msg}</span>}
    </div>
  );
}
