"use client";

import React from "react";

export default function ExportClient({ defaultYear }: { defaultYear: number }) {
  const [start, setStart] = React.useState(`${defaultYear}-01-01`);
  const [end, setEnd] = React.useState(`${defaultYear + 1}-01-01`);

  const href =
    start && end
      ? `/api/accounting/export?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`
      : `/api/accounting/export?year=${defaultYear}`;

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex flex-col">
        <label className="text-xs opacity-70 mb-1" htmlFor="start">Start (UTC)</label>
        <input
          id="start"
          type="date"
          className="bg-transparent border rounded px-2 py-1 text-sm"
          value={start}
          onChange={(e) => setStart(e.target.value)}
        />
      </div>
      <div className="flex flex-col">
        <label className="text-xs opacity-70 mb-1" htmlFor="end">End (UTC)</label>
        <input
          id="end"
          type="date"
          className="bg-transparent border rounded px-2 py-1 text-sm"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
        />
      </div>
      <a
        className="rounded border px-3 py-1 text-sm hover:bg-neutral-900"
        href={href}
        title="Download a ZIP with accountant-ready CSVs for the selected date range."
      >
        Download Tax Pack
      </a>
    </div>
  );
}
