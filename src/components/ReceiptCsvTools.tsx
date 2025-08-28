"use client";

import * as React from "react";

type Props = { redirectTo?: string };

type Row = {
  item_name: string;
  sku?: string | null;
  qty: number;
  unit: string;
  total_cost_usd: number;
  expires_on?: string | null;
  note?: string | null;
};

const TEMPLATE_HEADERS = [
  "item_name",
  "sku (optional)",
  "qty",
  "unit",
  "total_cost_usd",
  "expires_on (YYYY-MM-DD or Excel serial)",
  "note (optional)",
];

function excelSerialToISO(v: number): string {
  // Excel serial dates are days since 1899-12-30
  const base = new Date(Date.UTC(1899, 11, 30));
  const d = new Date(base.getTime() + v * 86400000);
  // yyyy-mm-dd
  return d.toISOString().slice(0, 10);
}

function toNumberLoose(x: unknown): number {
  // Trim, strip commas and spaces; turn into number
  const s = String(x ?? "").trim().replace(/,/g, "");
  if (!s) return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function parseCsv(text: string): Row[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const header = lines[0]
    .split(",")
    .map((s) => s.trim().toLowerCase());

  const idx = {
    item_name: header.indexOf("item_name"),
    sku: header.findIndex((h) => h.startsWith("sku")),
    qty: header.indexOf("qty"),
    unit: header.indexOf("unit"),
    total_cost_usd: header.indexOf("total_cost_usd"),
    expires_on: header.findIndex((h) => h.startsWith("expires_on")),
    note: header.findIndex((h) => h.startsWith("note")),
  };

  for (const [k, v] of Object.entries(idx)) {
    if (["item_name", "qty", "unit", "total_cost_usd"].includes(k) && v < 0) {
      throw new Error(`Missing required column: ${k}`);
    }
  }

  const out: Row[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",").map((s) => s.trim());

    const name = parts[idx.item_name]?.trim();
    if (!name) continue;

    const qty = toNumberLoose(parts[idx.qty]);
    const cost = toNumberLoose(parts[idx.total_cost_usd]);

    let expires_on: string | null = null;
    if (idx.expires_on >= 0) {
      const raw = parts[idx.expires_on]?.trim();
      if (raw) {
        const excel = toNumberLoose(raw);
        expires_on =
          Number.isFinite(excel) && excel > 1000
            ? excelSerialToISO(excel)
            : new Date(raw).toISOString().slice(0, 10);
      }
    }

    const unit = (parts[idx.unit] ?? "").trim().toLowerCase();
    const sku =
      idx.sku >= 0 && parts[idx.sku] ? String(parts[idx.sku]).trim() : null;
    const note = idx.note >= 0 ? parts[idx.note]?.trim() || null : null;

    out.push({
      item_name: name,
      sku,
      qty,
      unit,
      total_cost_usd: cost,
      expires_on,
      note,
    });
  }
  return out;
}

export default function ReceiptCsvTools({ redirectTo = "/inventory" }: Props) {
  const [busy, setBusy] = React.useState(false);
  const [banner, setBanner] = React.useState<{
    kind: "ok" | "err";
    msg: string;
  } | null>(null);

  React.useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 8000); // keep for 8s
    return () => clearTimeout(t);
  }, [banner]);

  async function downloadTemplate() {
    const rows = [
      TEMPLATE_HEADERS.join(","),
      [
        "Blue cheese dressing",
        "",
        "6000",
        "ml",
        "60.00",
        "2025-08-31",
        "batch A",
      ].join(","),
    ].join("\n");

    const blob = new Blob([rows], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "purchase_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      setBusy(true);
      const text = await f.text();
      const rows = parseCsv(text);
      if (rows.length === 0) {
        setBanner({ kind: "err", msg: "No rows found in CSV." });
        return;
      }

      const res = await fetch("/inventory/receipts/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rows }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBanner({
          kind: "err",
          msg:
            payload?.error ??
            `Upload failed (${res.status}). Please fix CSV and retry.`,
        });
        return;
      }

      const warn = payload?.warnings?.length
        ? ` (${payload.warnings.length} warnings)`
        : "";
      setBanner({
        kind: "ok",
        msg: `Uploaded ${payload?.inserted ?? rows.length} rows${warn}.`,
      });

      // optional: refresh the page numbers behind the modal
      setTimeout(() => {
        window.location.assign(redirectTo);
      }, 500);
    } catch (err: any) {
      setBanner({ kind: "err", msg: err?.message ?? "Upload failed." });
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  return (
    <div className="flex gap-3 items-center">
      <button
        type="button"
        className="px-4 py-2 rounded border hover:bg-neutral-900"
        onClick={downloadTemplate}
        disabled={busy}
      >
        Download template
      </button>

      <label className="px-4 py-2 rounded border hover:bg-neutral-900 cursor-pointer">
        <input
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={onUpload}
          disabled={busy}
        />
        Upload CSV
      </label>

      {banner && (
        <div
          className={`ml-2 px-3 py-2 rounded text-sm ${
            banner.kind === "ok" ? "bg-green-900/40" : "bg-red-900/40"
          }`}
        >
          <span>{banner.msg}</span>
          <button
            className="ml-2 opacity-70 hover:opacity-100"
            onClick={() => setBanner(null)}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
