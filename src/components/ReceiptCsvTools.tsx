"use client";

import * as React from "react";

type Props = {
  /** Where to send users after a successful upload (optional) */
  redirectTo?: string;
};

export default function ReceiptCsvTools({ redirectTo = "/inventory" }: Props) {
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<null | { text: string; kind: "ok" | "err" }>(null);
  const hideTimer = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, []);

  function downloadTemplate() {
    const header = [
      "item_name",
      "qty",
      "unit",
      "total_cost_usd",
      "expires_on",
      "note",
    ];
    const sample = [
      "Mozzarella",
      "5000",
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

  function parseCsv(text: string) {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length <= 1) return [];
    const header = lines[0].split(",").map((s) => s.trim().toLowerCase());
    const idx = (k: string) => header.indexOf(k);

    const need = ["item_name", "qty", "unit", "total_cost_usd", "expires_on", "note"];
    for (const col of need) {
      if (idx(col) === -1) throw new Error(`Missing column: ${col}`);
    }

    const rows: any[] = [];
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(",");
      if (!parts.join("").trim()) continue;
      rows.push({
        item_name: parts[idx("item_name")]?.trim() ?? "",
        qty_base: Number(parts[idx("qty")] ?? 0),
        unit: (parts[idx("unit")] ?? "").trim(),
        total_cost_usd: Number(parts[idx("total_cost_usd")] ?? 0),
        expires_on: (parts[idx("expires_on")] ?? "").trim(), // YYYY-MM-DD
        note: (parts[idx("note")] ?? "").trim(),
      });
    }
    return rows;
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;

    try {
      setBusy(true);
      setMsg(null);

      const text = await f.text();
      const rows = parseCsv(text);
      if (rows.length === 0) {
        setMsg({ text: "No rows found in file.", kind: "err" });
        scheduleHide();
        return;
      }

      const res = await fetch("/inventory/receipts/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });

      if (!res.ok) {
        const t = await safeText(res);
        setMsg({ text: `Upload failed (${res.status}): ${t}`, kind: "err" });
        scheduleHide();
        return;
      }

      // Response may include { inserted: N }
      let inserted: number | undefined = undefined;
      try {
        const j = await res.json();
        if (typeof j?.inserted === "number") inserted = j.inserted;
      } catch {
        /* ignore */
      }

      setMsg({
        text: inserted != null ? `Uploaded ${inserted} receipts.` : "Upload successful.",
        kind: "ok",
      });
      scheduleHide();

      // Optional redirect after a short pause so users can still see the toast
      setTimeout(() => {
        if (redirectTo) window.location.assign(redirectTo);
      }, 1200);
    } catch (err: any) {
      setMsg({ text: err?.message ?? "Upload failed.", kind: "err" });
      scheduleHide();
    } finally {
      setBusy(false);
      // reset input so same file can be re-selected
      e.currentTarget.value = "";
    }
  }

  function scheduleHide() {
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    // ⬇️ keep the message visible for 8 seconds
    hideTimer.current = window.setTimeout(() => setMsg(null), 8000);
  }

  return (
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

      {msg && (
        <span
          className={
            "text-sm " +
            (msg.kind === "ok" ? "text-emerald-400" : "text-red-400")
          }
          role="status"
          aria-live="polite"
        >
          {msg.text}
        </span>
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
