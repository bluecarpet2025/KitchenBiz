"use client";

import * as React from "react";

type CsvRow = {
  item_name: string;
  qty: number;
  unit: string;                // base or purchase unit (or empty for base)
  total_cost_usd: number;
  expires_on: string | null;   // YYYY-MM-DD or null
  note: string | null;
};

type Props = {
  redirectTo?: string;
};

export default function ReceiptCsvTools({ redirectTo = "/inventory" }: Props) {
  const fileRef = React.useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  function downloadTemplate() {
    const headers = [
      "item_name",
      "qty",
      "unit",
      "total_cost_usd",
      "expires_on",
      "note",
    ].join(",");

    const sample = [
      "Mozzarella",
      "5",
      "kg",
      "37.50",
      "2025-09-30",
      "batch 101",
    ].join(",");

    const blob = new Blob([headers + "\n" + sample + "\n"], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "purchase_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function parseCsv(text: string): CsvRow[] {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) return [];
    const header = lines[0].split(",").map((s) => s.trim().toLowerCase());
    const idx = (k: string) => header.indexOf(k);

    const need = [
      "item_name",
      "qty",
      "unit",
      "total_cost_usd",
      "expires_on",
      "note",
    ];
    for (const col of need) {
      if (idx(col) === -1) throw new Error(`Missing column: ${col}`);
    }

    const rows: CsvRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(",");
      if (!parts.join("").trim()) continue;

      rows.push({
        item_name: (parts[idx("item_name")] ?? "").trim(),
        qty: Number(parts[idx("qty")] ?? 0),
        unit: (parts[idx("unit")] ?? "").trim(),
        total_cost_usd: Number(parts[idx("total_cost_usd")] ?? 0),
        expires_on: (parts[idx("expires_on")] ?? "").trim() || null,
        note: (parts[idx("note")] ?? "").trim() || null,
      });
    }
    return rows;
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;

    try {
      setBusy(true);
      setMsg("Uploading…");
      const text = await f.text();
      const rows = parseCsv(text);
      if (rows.length === 0) {
        setMsg("No rows found.");
        setBusy(false);
        return;
      }

      const res = await fetch("/inventory/receipts/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || "Import failed");
      setMsg(`Imported ${j.inserted} receipt${j.inserted === 1 ? "" : "s"}. Redirecting…`);
      window.location.href = redirectTo;
    } catch (err: any) {
      setMsg(err?.message || "Upload failed");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      <button
        onClick={downloadTemplate}
        className="px-3 py-2 border rounded-md hover:bg-neutral-900"
      >
        Download CSV template
      </button>

      <label className="px-3 py-2 border rounded-md hover:bg-neutral-900 cursor-pointer">
        {busy ? "Uploading…" : "Upload CSV"}
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={onUpload}
          disabled={busy}
        />
      </label>

      {msg && <span className="opacity-70">{msg}</span>}
    </div>
  );
}
