"use client";

import * as React from "react";
import Notice from "@/components/Notice";

type Props = {
  /** Where to send users after a successful upload (optional) */
  redirectTo?: string;
};

type UploadMsg = { text: string; kind: "ok" | "err" } | null;

export default function ReceiptCsvTools({ redirectTo = "/inventory" }: Props) {
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<UploadMsg>(null);

  function downloadTemplate() {
    const header = [
      "item_name",
      "qty",               // base units; allow commas; we'll normalize
      "unit",              // base unit symbol, e.g., g / ml / each
      "total_cost_usd",    // numeric with or without commas
      "expires_on",        // YYYY-MM-DD (optional)
      "note",              // optional
    ];
    const sample = [
      "Mozzarella",
      "5,000",
      "g",
      "35.00",
      "2025-09-30",
      "invoice #123",
    ];
    const csv = [header.join(","), sample.join(",")].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "purchase-receipts-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const toNumber = (v: unknown) => {
    const s = String(v ?? "").trim().replace(/,/g, "");
    if (!s) return NaN;
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
  };

  function parseCsv(text: string) {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length <= 1) return { rows: [] as any[], errors: [] as string[] };

    const header = lines[0].split(",").map((s) => s.trim().toLowerCase());
    const idx = (k: string) => header.indexOf(k);
    const need = ["item_name", "qty", "unit", "total_cost_usd"];
    const errors: string[] = [];

    for (const col of need) {
      if (idx(col) === -1) errors.push(`Missing column: ${col}`);
    }
    if (errors.length) return { rows: [], errors };

    const rows: any[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;

      const parts = line.split(",");
      const rowNum = i + 1;

      const item_name = (parts[idx("item_name")] ?? "").trim();
      const unit = (parts[idx("unit")] ?? "").trim();
      const qty_base = toNumber(parts[idx("qty")]);
      const total_cost_usd = toNumber(parts[idx("total_cost_usd")]);
      const expires_on = (parts[idx("expires_on")] ?? "").trim();
      const note = (parts[idx("note")] ?? "").trim();

      if (!item_name) errors.push(`Row ${rowNum}: item_name is required`);
      if (!unit) errors.push(`Row ${rowNum}: unit is required`);
      if (!Number.isFinite(qty_base) || qty_base <= 0)
        errors.push(`Row ${rowNum}: qty must be a positive number`);
      if (!Number.isFinite(total_cost_usd) || total_cost_usd < 0)
        errors.push(`Row ${rowNum}: total_cost_usd must be ≥ 0`);

      rows.push({ item_name, unit, qty_base, total_cost_usd, expires_on, note });
    }

    return { rows, errors };
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;

    try {
      setBusy(true);
      setMsg(null);

      const text = await f.text();
      const { rows, errors } = parseCsv(text);

      if (errors.length) {
        setMsg({
          kind: "err",
          text:
            "CSV has issues:\n" +
            errors.slice(0, 5).join("; ") +
            (errors.length > 5 ? ` …(+${errors.length - 5} more)` : ""),
        });
        return;
      }
      if (rows.length === 0) {
        setMsg({ kind: "err", text: "No rows found in file." });
        return;
      }

      const res = await fetch("/inventory/receipts/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });

      if (!res.ok) {
        const t = await safeText(res);
        setMsg({ kind: "err", text: `Upload failed (${res.status}): ${t}` });
        return;
      }

      let inserted: number | undefined = undefined;
      try {
        const j = await res.json();
        if (typeof j?.inserted === "number") inserted = j.inserted;
      } catch {
        /* ignore non-JSON response */
      }

      setMsg({
        kind: "ok",
        text: inserted != null ? `Uploaded ${inserted} receipts.` : "Upload successful.",
      });

      // optional redirect so user still sees the banner; they can dismiss sooner
      setTimeout(() => {
        if (redirectTo) window.location.assign(redirectTo);
      }, 1200);
    } catch (err: any) {
      setMsg({ kind: "err", text: err?.message ?? "Upload failed." });
    } finally {
      setBusy(false);
      e.currentTarget.value = ""; // allow re-selecting same file
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={downloadTemplate}
          className="px-4 py-2 rounded-md border text-sm hover:bg-neutral-900"
        >
          Download template
        </button>

        <label className="px-4 py-2 rounded-md border text-sm hover:bg-neutral-900 cursor-pointer">
          <input type="file" className="hidden" accept=".csv,text/csv" onChange={onUpload} disabled={busy} />
          {busy ? "Uploading…" : "Upload CSV"}
        </label>
      </div>

      {msg && (
        <Notice
          kind={msg.kind}
          onClose={() => setMsg(null)}
          // keep it around; user dismisses explicitly
        >
          <pre className="whitespace-pre-wrap">{msg.text}</pre>
        </Notice>
      )}
    </div>
  );
}

async function safeText(res: Response) {
  try {
    return await res.text();
  } catch {
    return "";
  }
}
