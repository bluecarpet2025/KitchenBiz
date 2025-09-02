"use client";

import * as React from "react";
import ReceiptCsvTools from "@/components/ReceiptCsvTools";
import { fmtUSD } from "@/lib/costing";

type ItemOpt = { id: string; name: string; base_unit: string | null };

type Line = {
  item_id: string;
  qty_base: string;
  unit_cost_total: string;
};

export default function NewReceiptForm({
  items,
  tenantId,
}: {
  items: ItemOpt[];
  tenantId?: string;
}) {
  const [date, setDate] = React.useState<string>(() => {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 10);
  });
  const [note, setNote] = React.useState("");
  const [lines, setLines] = React.useState<Line[]>([
    { item_id: "", qty_base: "", unit_cost_total: "" },
  ]);

  // New: photo state
  const [photo, setPhoto] = React.useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = React.useState<string | null>(null);

  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState(false);

  function addLine() {
    setLines((xs) => [...xs, { item_id: "", qty_base: "", unit_cost_total: "" }]);
  }
  function setLine(idx: number, patch: Partial<Line>) {
    setLines((xs) => xs.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
  }

  const totalValue = lines.reduce((sum, l) => {
    const v = Number(l.unit_cost_total || 0);
    return sum + (isFinite(v) ? v : 0);
  }, 0);

  function onPickPhoto(file: File | null) {
    setPhoto(file);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(file ? URL.createObjectURL(file) : null);
  }

  async function uploadPhotoIfNeeded(): Promise<string | null> {
    if (!photo) return null;
    const fd = new FormData();
    fd.append("file", photo);
    const res = await fetch("/api/receipt-upload", {
      method: "POST",
      body: fd,
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(t || "Photo upload failed");
    }
    const data = await res.json();
    return data?.path || null;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOk(false);

    try {
      const payloadLines = lines
        .filter((l) => l.item_id && Number(l.qty_base) > 0)
        .map((l) => ({
          item_id: l.item_id,
          qty_base: Number(l.qty_base),
          total_cost_usd: Number(l.unit_cost_total) || 0,
          expires_on: null as string | null,
          note: note || null,
        }));

      if (payloadLines.length === 0) {
        setError("Add at least one valid line.");
        setBusy(false);
        return;
      }

      // 1) upload photo if provided
      const photo_path = await uploadPhotoIfNeeded();

      // 2) save receipt rows
      const res = await fetch("/inventory/receipts/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          purchased_at: date,
          rows: payloadLines,
          photo_path, // <-- stored on each inserted row
        }),
      });

      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `HTTP ${res.status}`);
      }

      setOk(true);
      window.location.href = "/inventory/receipts";
    } catch (err: any) {
      setError(err?.message ?? "Failed to save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        <label className="block">
          <div className="text-sm mb-1">Purchase date</div>
          <input
            type="date"
            className="w-full bg-black border rounded px-3 py-2"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </label>

        <label className="block">
          <div className="text-sm mb-1">Note (optional)</div>
          <input
            type="text"
            className="w-full bg-black border rounded px-3 py-2"
            placeholder="Invoice #, vendor, etc."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
      </div>

      {/* Receipt photo */}
      <div className="border rounded p-3">
        <div className="text-sm mb-2 font-medium">Receipt photo (optional)</div>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => onPickPhoto(e.target.files?.[0] ?? null)}
          className="block w-full text-sm"
        />
        {photoPreview && (
          <div className="mt-2">
            <img
              src={photoPreview}
              alt="Preview"
              className="max-h-48 rounded-md border"
            />
          </div>
        )}
      </div>

      <div className="border rounded">
        <div className="grid grid-cols-12 gap-2 px-3 py-2 text-sm bg-neutral-900/60">
          <div className="col-span-6">Item</div>
          <div className="col-span-2 text-right">Qty</div>
          <div className="col-span-2">Unit</div>
          <div className="col-span-2 text-right">Cost (total)</div>
        </div>

        {lines.map((ln, i) => {
          const item = items.find((x) => x.id === ln.item_id);
          return (
            <div key={i} className="grid grid-cols-12 gap-2 px-3 py-2 border-t">
              <div className="col-span-6">
                <select
                  className="w-full bg-black border rounded px-2 py-2"
                  value={ln.item_id}
                  onChange={(e) => setLine(i, { item_id: e.target.value })}
                >
                  <option value="">Select item…</option>
                  {items.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-span-2">
                <input
                  inputMode="decimal"
                  className="w-full text-right bg-black border rounded px-2 py-2"
                  placeholder="0"
                  value={ln.qty_base}
                  onChange={(e) => setLine(i, { qty_base: e.target.value })}
                />
              </div>

              <div className="col-span-2 flex items-center">
                <input
                  className="w-full bg-black border rounded px-2 py-2 opacity-70"
                  value={item?.base_unit ?? "base"}
                  readOnly
                />
              </div>

              <div className="col-span-2">
                <input
                  inputMode="decimal"
                  className="w-full text-right bg-black border rounded px-2 py-2"
                  placeholder="$ 0.00"
                  value={ln.unit_cost_total}
                  onChange={(e) => setLine(i, { unit_cost_total: e.target.value })}
                />
              </div>
            </div>
          );
        })}

        <div className="px-3 py-2 border-t">
          <button
            type="button"
            onClick={addLine}
            className="text-sm px-3 py-2 border rounded hover:bg-neutral-900"
          >
            + Add line
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm opacity-70">
          Total value: <span className="tabular-nums font-medium">{fmtUSD(totalValue)}</span>
        </div>
        <button
          type="submit"
          disabled={busy}
          className="px-4 py-2 border rounded hover:bg-neutral-900 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save Purchase"}
        </button>
      </div>

      <div className="pt-4">
        <ReceiptCsvTools autoHideMs={15000} />
      </div>

      {error && <div className="text-red-400 text-sm">{error}</div>}
      {ok && <div className="text-green-400 text-sm">Saved.</div>}
    </form>
  );
}
