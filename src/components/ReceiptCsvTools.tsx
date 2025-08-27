"use client";

import * as React from "react";

type Row = {
  item_name: string;
  qty: number;
  unit: string;
  total_cost_usd: number;
  expires_on: string | null; // ISO (YYYY-MM-DD) or null
  note: string | null;
};

export default function ReceiptCsvTools({ redirectTo = "/inventory" }: { redirectTo?: string }) {
  const [busy, setBusy] = React.useState(false);

  function downloadTemplate() {
    const csv =
`item_name,qty,unit,total_cost_usd,expires_on,note
Mozzarella,5000,kg,37.50,2025-09-30,weekly order
Tomato sauce,10000,ml,25.00,,(optional)
`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "purchase_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function parseCsv(text: string): Row[] {
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return [];

    const header = lines[0].split(",").map(s => s.trim().toLowerCase());
    const idx = (k: string) => header.indexOf(k);

    const need = ["item_name","qty","unit","total_cost_usd","expires_on","note"];
    for (const k of need) if (idx(k) < 0) throw new Error(`Missing column: ${k}`);

    const rows: Row[] = [];
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(",").map(s => s.trim());
      if (!parts[idx("item_name")]?.trim()) continue;

      const item_name = parts[idx("item_name")].trim();
      const qty = Number(parts[idx("qty")] ?? 0);
      const unit = parts[idx("unit")] ?? "";
      const total_cost_usd = Number(parts[idx("total_cost_usd")] ?? 0);
      const expires_on_raw = parts[idx("expires_on")]?.trim();
      const expires_on = expires_on_raw ? new Date(expires_on_raw).toISOString().slice(0,10) : null;
      const note = (parts[idx("note")] ?? "").trim() || null;

      rows.push({ item_name, qty, unit, total_cost_usd, expires_on, note });
    }
    return rows;
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      setBusy(true);
      const text = await f.text();
      const rows = parseCsv(text);
      if (!rows.length) { alert("No rows found."); setBusy(false); return; }

      const res = await fetch("/inventory/receipts/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rows }),
      });

      if (!res.ok) {
        const msg = await res.text();
        alert(`Upload failed: ${msg}`);
      } else {
        window.location.href = redirectTo;
      }
    } catch (err: any) {
      alert(err?.message ?? "Upload failed");
    } finally {
      setBusy(false);
      e.currentTarget.value = "";
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={downloadTemplate}
        className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
        Download template
      </button>
      <label className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900 cursor-pointer">
        {busy ? "Uploading…" : "Upload CSV"}
        <input disabled={busy} onChange={onUpload} type="file" accept=".csv" hidden />
      </label>
    </div>
  );
}
