"use client";

import * as React from "react";

type Props = {
  /** Where to send the user after a successful upload */
  redirectTo?: string;
};

type CsvRow = {
  item_name: string;
  qty: number;
  unit: string;
  total_cost_usd: number;
  expires_on: string | null; // YYYY-MM-DD or null
  note: string | null;
};

export default function ReceiptCsvTools({ redirectTo = "/inventory" }: Props) {
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  function downloadTemplate() {
    const header = "item_name,qty,unit,total_cost_usd,expires_on,note\n";
    // one short sample row users can delete
    const sample =
      "Mozzarella,5000,g,35.00,2025-09-30,second batch\n";
    const blob = new Blob([header + sample], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "receipts_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function parseCsv(text: string): CsvRow[] {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) return [];

    const header = lines[0].split(",").map((s) => s.trim().toLowerCase());
    const idx = (k: string) => {
      const i = header.indexOf(k);
      if (i === -1) throw new Error(`Missing column: ${k}`);
      return i;
    };

    const iName = idx("item_name");
    const iQty = idx("qty");
    const iUnit = idx("unit");
    const iCost = idx("total_cost_usd");
    const iExp = idx("expires_on");
    const iNote = idx("note");

    const rows: CsvRow[] = [];
    for (let lineNum = 1; lineNum < lines.length; lineNum++) {
      const raw = lines[lineNum];
      if (!raw) continue;
      const parts = raw.split(",").map((s) => s.trim());

      // allow short rows at end (e.g., trailing newline)
      if (parts.length === 1 && parts[0] === "") continue;

      const r: CsvRow = {
        item_name: (parts[iName] ?? "").trim(),
        qty: Number(parts[iQty] ?? "0"),
        unit: (parts[iUnit] ?? "").trim(),
        total_cost_usd: Number(parts[iCost] ?? "0"),
        expires_on: (parts[iExp] ?? "").trim() || null,
        note: (parts[iNote] ?? "").trim() || null,
      };

      if (!r.item_name) throw new Error(`Row ${lineNum}: item_name is required`);
      if (!isFinite(r.qty) || r.qty <= 0) throw new Error(`Row ${lineNum}: qty must be > 0`);
      if (!r.unit) throw new Error(`Row ${lineNum}: unit is required`);
      if (!isFinite(r.total_cost_usd) || r.total_cost_usd < 0)
        throw new Error(`Row ${lineNum}: total_cost_usd must be >= 0`);

      rows.push(r);
    }
    return rows;
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setMsg(null);

    try {
      setBusy(true);
      const text = await f.text();
      const rows = parseCsv(text);
      if (rows.length === 0) {
        setMsg({ kind: "err", text: "No rows found in file." });
        return;
      }

      // POST JSON to the import route
      const res = await fetch("/inventory/receipts/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rows }),
      });

      // Try to read JSON response if present
      let info: any = null;
      try {
        info = await res.json();
      } catch {
        /* no-op */
      }

      if (!res.ok) {
        const errText =
          (info && (info.error || info.message)) ||
          `Upload failed (${res.status})`;
        setMsg({ kind: "err", text: errText });
        return;
      }

      const inserted =
        (info && (info.inserted || info.count || info.rows)) || rows.length;

      setMsg({
        kind: "ok",
        text: `Upload complete. Imported ${inserted} row${inserted === 1 ? "" : "s"}.`,
      });

      // soft refresh of page metrics after a short delay
      setTimeout(() => {
        window.location.assign(redirectTo);
      }, 800);
    } catch (err: any) {
      setMsg({ kind: "err", text: err?.message || "Upload failed." });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
        onClick={downloadTemplate}
      >
        Download template
      </button>

      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        onChange={onUpload}
        className="hidden"
      />
      <button
        type="button"
        disabled={busy}
        className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900 disabled:opacity-50"
        onClick={() => fileRef.current?.click()}
      >
        {busy ? "Uploading…" : "Upload CSV"}
      </button>

      {msg && (
        <span
          className={`ml-2 text-sm ${
            msg.kind === "ok" ? "text-emerald-400" : "text-red-400"
          }`}
        >
          {msg.text}
        </span>
      )}
    </div>
  );
}
