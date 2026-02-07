"use client";

import * as React from "react";
import type { DefinitionsItem } from "./dashboardTypes";

export default function DefinitionsDrawer({ items }: { items: DefinitionsItem[] }) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-3 py-1 rounded border border-neutral-800 hover:bg-neutral-900 text-sm"
        title="See definitions & formulas"
      >
        Definitions
      </button>

      {open && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-0 h-full w-full max-w-xl bg-neutral-950 border-l border-neutral-800 p-4 overflow-auto">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <h2 className="text-lg font-semibold">Definitions</h2>
                <p className="text-sm opacity-70">
                  These are the exact formulas used in the dashboard.
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="px-3 py-1 rounded border border-neutral-800 hover:bg-neutral-900 text-sm"
              >
                Close
              </button>
            </div>

            <div className="space-y-3">
              {items.map((it, idx) => (
                <div key={idx} className="rounded border border-neutral-800 p-3">
                  <div className="font-medium">{it.label}</div>
                  <div className="text-sm opacity-80 mt-1">
                    <span className="opacity-70">Formula: </span>
                    <code className="opacity-90">{it.formula}</code>
                  </div>
                  {it.note && <div className="text-sm opacity-70 mt-2">{it.note}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
