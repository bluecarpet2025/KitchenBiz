"use client";

import * as React from "react";

type Props = {
  kind?: "ok" | "err" | "info";
  children: React.ReactNode;
  onClose?: () => void;
  /** If set, auto-dismiss after ms (still dismissible) */
  autoHideMs?: number;
  className?: string;
};

export default function Notice({
  kind = "info",
  children,
  onClose,
  autoHideMs,
  className = "",
}: Props) {
  React.useEffect(() => {
    if (!autoHideMs) return;
    const t = setTimeout(() => onClose?.(), autoHideMs);
    return () => clearTimeout(t);
  }, [autoHideMs, onClose]);

  const tone =
    kind === "ok"
      ? "border-emerald-500/40 bg-emerald-900/20 text-emerald-300"
      : kind === "err"
      ? "border-red-500/40 bg-red-900/20 text-red-300"
      : "border-sky-500/40 bg-sky-900/20 text-sky-200";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-sm ${tone} ${className}`}
    >
      <div className="leading-5">{children}</div>
      <button
        type="button"
        onClick={() => onClose?.()}
        className="ml-2 shrink-0 rounded px-1.5 py-0.5 text-xs hover:bg-white/10"
        aria-label="Dismiss"
        title="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
