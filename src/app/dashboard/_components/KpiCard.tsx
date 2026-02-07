import * as React from "react";

export default function KpiCard({
  label,
  value,
  hint,
  formula,
}: {
  label: string;
  value: string;
  hint?: string;
  formula?: string;
}) {
  const tooltip = [hint, formula ? `Formula: ${formula}` : null].filter(Boolean).join(" • ");
  return (
    <div className="rounded border border-neutral-800 p-4 bg-neutral-950/40">
      <div className="flex items-center gap-2">
        <div className="text-sm opacity-80">{label}</div>
        {tooltip ? (
          <span className="text-xs opacity-60 cursor-help" title={tooltip}>
            ⓘ
          </span>
        ) : null}
      </div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </div>
  );
}
