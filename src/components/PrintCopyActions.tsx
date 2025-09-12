"use client";

import { useState } from "react";

export default function PrintCopyActions({ menuId }: { menuId: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function doPrint() {
    window.print();
  }

  async function copyShareLink() {
    try {
      setBusy(true);
      setMsg(null);

      const res = await fetch("/api/menu/share", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ menu_id: menuId }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      const { token } = await res.json();
      const url = `${location.origin}/share/${encodeURIComponent(token)}`;
      await navigator.clipboard.writeText(url);
      setMsg("Link copied!");
    } catch (e: any) {
      setMsg(e.message ?? "Copy failed");
    } finally {
      setBusy(false);
      setTimeout(() => setMsg(null), 2500);
    }
  }

  return (
    <div className="flex items-center gap-3 print:hidden">
      <button
        onClick={doPrint}
        className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
      >
        Print
      </button>
      <button
        onClick={copyShareLink}
        disabled={busy}
        className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900 disabled:opacity-50"
      >
        {busy ? "Copying…" : "Copy link"}
      </button>
      {msg && <span className="text-xs opacity-75">{msg}</span>}
    </div>
  );
}
