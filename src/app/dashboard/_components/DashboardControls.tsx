"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Mode = "today" | "week" | "month" | "ytd" | "custom";

const modes: Array<{ key: Mode; label: string }> = [
  { key: "today", label: "Today" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "ytd", label: "YTD" },
  { key: "custom", label: "Custom" },
];

export default function DashboardControls() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const mode = (sp.get("mode") as Mode) ?? "month";
  const [start, setStart] = React.useState(sp.get("start") ?? "");
  const [end, setEnd] = React.useState(sp.get("end") ?? "");

  React.useEffect(() => {
    setStart(sp.get("start") ?? "");
    setEnd(sp.get("end") ?? "");
  }, [sp]);

  function setMode(next: Mode) {
    const nextParams = new URLSearchParams(sp.toString());
    nextParams.set("mode", next);

    if (next !== "custom") {
      nextParams.delete("start");
      nextParams.delete("end");
    }
    router.push(`${pathname}?${nextParams.toString()}`);
  }

  function applyCustom() {
    const s = start?.trim();
    const e = end?.trim();
    if (!s || !e || s >= e) return;

    const nextParams = new URLSearchParams(sp.toString());
    nextParams.set("mode", "custom");
    nextParams.set("start", s);
    nextParams.set("end", e);
    router.push(`${pathname}?${nextParams.toString()}`);
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
      <div className="flex flex-wrap gap-2">
        {modes.map((m) => {
          const active = mode === m.key;
          return (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              className={[
                "px-3 py-1 rounded border text-sm",
                active ? "border-neutral-200" : "border-neutral-800 hover:bg-neutral-900",
              ].join(" ")}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      {mode === "custom" && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col">
            <label className="text-xs opacity-70">Start</label>
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="px-2 py-1 rounded border border-neutral-800 bg-neutral-950 text-sm"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-xs opacity-70">End (exclusive)</label>
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="px-2 py-1 rounded border border-neutral-800 bg-neutral-950 text-sm"
            />
          </div>
          <button
            onClick={applyCustom}
            className="px-3 py-1 rounded border border-neutral-800 hover:bg-neutral-900 text-sm"
            title="Start must be earlier than end"
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
}
