"use client";

import { useCallback, useState } from "react";

type Props = { menuId: string };

export default function PrintCopyActions({ menuId }: Props) {
  const [msg, setMsg] = useState<string | null>(null);

  const currentMargin = () => {
    try {
      const u = new URL(window.location.href);
      const m = Number(u.searchParams.get("margin") ?? "0.3");
      return isFinite(m) ? Math.max(0, Math.min(0.95, m)) : 0.3;
    } catch {
      return 0.3;
    }
  };

  const onPrint = useCallback(() => {
    window.print();
  }, []);

  const onCopyLink = useCallback(async () => {
    try {
      setMsg(null);
      const res = await fetch(`/api/menu/share`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ menu_id: menuId }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { token } = await res.json();
      const url = `${location.origin}/share/${token}?margin=${currentMargin()}`;
      await navigator.clipboard.writeText(url);
      setMsg("Link copied ✓");
      setTimeout(() => setMsg(null), 2500);
    } catch (err: any) {
      setMsg(err?.message || "Failed to copy link");
      setTimeout(() => setMsg(null), 4000);
    }
  }, [menuId]);

  return (
    <div className="print:hidden flex items-center gap-3">
      <button onClick={onPrint} className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
        Print
      </button>
      <button onClick={onCopyLink} className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
        Copy link
      </button>
      {msg && <span className="text-xs opacity-70">{msg}</span>}
    </div>
  );
}
