// Server component: New Purchase
import ReceiptCsvTools from "@/components/ReceiptCsvTools";
import { createServerClient } from "@/lib/supabase/server";
import Link from "next/link";

export const dynamic = "force-dynamic";

type Item = {
  id: string;
  name: string;
  base_unit: string | null;
  purchase_unit: string | null;
  pack_to_base_factor: number | null;
};

async function getTenant() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, tenantId: null };
  const { data: prof } = await supabase
    .from("profiles").select("tenant_id").eq("id", user.id).maybeSingle();
  return { supabase, user, tenantId: prof?.tenant_id ?? null };
}

export default async function NewReceiptPage() {
  const { supabase, user, tenantId } = await getTenant();
  if (!user || !tenantId) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">New Purchase</h1>
        <p className="mt-4">Sign in required.</p>
        <Link className="underline" href="/inventory">Back to Inventory</Link>
      </main>
    );
  }

  const { data } = await supabase
    .from("inventory_items")
    .select("id,name,base_unit,purchase_unit,pack_to_base_factor")
    .eq("tenant_id", tenantId)
    .order("name");

  const items = (data ?? []) as Item[];

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">New Purchase</h1>
        <div className="flex gap-2">
          <Link href="/inventory" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
            Back to Inventory
          </Link>
          <ReceiptCsvTools redirectTo="/inventory" />
        </div>
      </div>

      <NewReceiptForm items={items} />
    </main>
  );
}

/* ------------------ Client form ------------------ */
"use client";

import * as React from "react";

type ItemLite = {
  id: string;
  name: string;
  base_unit: string | null;
  purchase_unit: string | null;
  pack_to_base_factor: number | null;
};

type Line = {
  itemId: string;
  qty: string;
  unit: string;        // base or purchase unit label; empty = base
  totalCost: string;
  expiresOn: string;   // YYYY-MM-DD
};

function emptyLine(): Line {
  return { itemId: "", qty: "", unit: "", totalCost: "", expiresOn: "" };
}

function toUSD(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function NewReceiptForm({ items }: { items: ItemLite[] }) {
  const [date, setDate] = React.useState<string>(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${mm}/${dd}/${yyyy}`;
  });
  const [note, setNote] = React.useState("");
  const [lines, setLines] = React.useState<Line[]>([emptyLine()]);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  const byId = React.useMemo(() => {
    const m = new Map<string, ItemLite>();
    items.forEach((it) => m.set(it.id, it));
    return m;
  }, [items]);

  function addLine() {
    setLines((l) => [...l, emptyLine()]);
  }
  function updateLine(i: number, patch: Partial<Line>) {
    setLines((arr) => arr.map((ln, idx) => (idx === i ? { ...ln, ...patch } : ln)));
  }

  async function save() {
    try {
      setBusy(true);
      setMsg("Saving…");

      // Convert to rows the import API understands (by item_name).
      const rows = lines
        .filter((l) => l.itemId && Number(l.qty) > 0)
        .map((l) => {
          const it = byId.get(l.itemId)!;
          const unit = l.unit || (it.base_unit ?? "");
          return {
            item_name: it.name,
            qty: Number(l.qty),
            unit,
            total_cost_usd: Number(l.totalCost || 0),
            expires_on: l.expiresOn || null,
            note: note ? note : null,
          };
        });

      if (rows.length === 0) {
        setMsg("Add at least one line.");
        setBusy(false);
        return;
      }

      const res = await fetch("/inventory/receipts/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || "Save failed");
      setMsg(`Saved ${j.inserted} line${j.inserted === 1 ? "" : "s"}. Redirecting…`);
      window.location.href = "/inventory";
    } catch (e: any) {
      setMsg(e?.message || "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div>
          <div className="text-sm opacity-70">Purchase date</div>
          <input
            className="px-3 py-2 bg-transparent border rounded-md"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            placeholder="MM/DD/YYYY"
          />
        </div>
        <div className="flex-1">
          <div className="text-sm opacity-70">Note (optional)</div>
          <input
            className="w-full px-3 py-2 bg-transparent border rounded-md"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Invoice #, vendor, etc."
          />
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900/60">
            <tr>
              <th className="text-left p-2">Item</th>
              <th className="text-right p-2">Qty</th>
              <th className="text-left p-2">Unit</th>
              <th className="text-right p-2">Cost (total)</th>
              <th className="text-left p-2">Expires</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((ln, i) => {
              const it = ln.itemId ? byId.get(ln.itemId) : null;
              const base = it?.base_unit ?? "";
              const purch = it?.purchase_unit ?? "";
              return (
                <tr key={i} className="border-t">
                  <td className="p-2">
                    <select
                      className="bg-transparent border rounded px-2 py-1"
                      value={ln.itemId}
                      onChange={(e) => updateLine(i, { itemId: e.target.value, unit: it?.base_unit ?? "" })}
                    >
                      <option value="">Select item…</option>
                      {items.map((it) => (
                        <option key={it.id} value={it.id}>
                          {it.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-2">
                    <input
                      className="w-28 text-right bg-transparent border rounded px-2 py-1"
                      value={ln.qty}
                      onChange={(e) => updateLine(i, { qty: e.target.value })}
                      placeholder="0"
                    />
                  </td>
                  <td className="p-2">
                    <select
                      className="bg-transparent border rounded px-2 py-1"
                      value={ln.unit}
                      onChange={(e) => updateLine(i, { unit: e.target.value })}
                      disabled={!it}
                    >
                      <option value="">{base || "auto-fills base unit"}</option>
                      {purch && <option value={purch}>{purch}</option>}
                      {base && <option value={base}>{base}</option>}
                    </select>
                  </td>
                  <td className="p-2">
                    <input
                      className="w-32 text-right bg-transparent border rounded px-2 py-1"
                      value={ln.totalCost}
                      onChange={(e) => updateLine(i, { totalCost: e.target.value })}
                      placeholder="$ 0.00"
                    />
                  </td>
                  <td className="p-2">
                    <input
                      className="w-36 bg-transparent border rounded px-2 py-1"
                      value={ln.expiresOn}
                      onChange={(e) => updateLine(i, { expiresOn: e.target.value })}
                      placeholder="YYYY-MM-DD"
                    />
                  </td>
                </tr>
              );
            })}
            <tr className="border-t">
              <td className="p-2">
                <button onClick={addLine} className="text-sm underline">
                  + Add line
                </button>
              </td>
              <td />
              <td />
              <td />
              <td />
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={busy}
          className="px-3 py-2 border rounded-md hover:bg-neutral-900"
        >
          {busy ? "Saving…" : "Save Purchase"}
        </button>
        {msg && <span className="opacity-70">{msg}</span>}
      </div>

      <div className="opacity-70 text-xs">
        Avg cost is calculated from purchases. Upload CSV to import many lines.
      </div>
    </div>
  );
}
