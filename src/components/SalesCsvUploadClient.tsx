// src/components/SalesCsvUploadClient.tsx
"use client";

import { useState } from "react";

type CsvRow = {
  occurred_at?: string;
  source?: string;
  channel?: string;
  order_ref?: string;
  product_name?: string;
  qty?: string | number;
  unit_price?: string | number;
};

function parseCSV(text: string): CsvRow[] {
  // Minimal CSV parser (handles commas & quotes). For complex cases, you can swap to PapaParse.
  const rows: CsvRow[] = [];
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(Boolean);
  if (lines.length === 0) return rows;

  const headers = splitCsvLine(lines[0]).map(h => h.trim());
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const obj: any = {};
    headers.forEach((h, idx) => { obj[h] = cols[idx]?.trim?.() ?? ""; });
    rows.push(obj);
  }
  return rows;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i+1] === '"') { cur += '"'; i++; }
        else { inQuotes = false; }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") { out.push(cur); cur=""; }
      else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

export default function SalesCsvUploadClient({ tenantId }: { tenantId: string }) {
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<CsvRow[]>([]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const txt = await file.text();
    const rows = parseCSV(txt);
    setPreview(rows.slice(0, 10));
  }

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    const input = (document.getElementById("csvfile") as HTMLInputElement);
    const file = input.files?.[0];
    if (!file) { alert("Choose a CSV file first."); return; }
    const text = await file.text();
    const rows = parseCSV(text);
    if (rows.length === 0) { alert("CSV appears empty."); return; }

    setBusy(true);
    setStatus("Uploading…");
    try {
      const resp = await fetch("/api/sales/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, rows }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json?.error ?? "Import failed");
      setStatus(`Imported ${json.insertedOrders} orders, ${json.insertedLines} lines.`);
    } catch (err: any) {
      alert(err?.message ?? "Upload failed");
      setStatus("Error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={upload} className="space-y-3">
      <input id="csvfile" type="file" accept=".csv,text/csv" onChange={onFile}
             className="block w-full border rounded p-2 bg-neutral-950" />
      {preview.length > 0 && (
        <div className="text-xs opacity-80">
          Preview (first 10 rows):
          <pre className="mt-2 p-2 bg-neutral-950 border rounded overflow-x-auto">
            {JSON.stringify(preview, null, 2)}
          </pre>
        </div>
      )}
      <button disabled={busy} className="px-4 py-2 bg-white text-black rounded font-medium disabled:opacity-50">
        {busy ? "Uploading…" : "Import CSV"}
      </button>
      {status && <div className="text-sm opacity-80">{status}</div>}
    </form>
  );
}
