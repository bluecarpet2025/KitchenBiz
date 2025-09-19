"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

/** Keep it loose to avoid TS issues with joined shapes */
type AnyRow = any;

export default function SalesEditorClient({ initialRows }: { initialRows: AnyRow[] }) {
  const [rows, setRows] = useState<AnyRow[]>(initialRows);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => setRows(initialRows), [initialRows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      (r?.product_name ?? "").toLowerCase().includes(needle) ||
      (r?.sales_orders?.occurred_at ?? "").toLowerCase().includes(needle)
    );
  }, [q, rows]);

  async function refresh() {
    const { data } = await supabase
      .from("sales_order_lines")
      .select("id, product_name, qty, unit_price, order_id, sales_orders!inner(occurred_at)")
      .order("id", { ascending: false })
      .limit(200);
    setRows((data ?? []) as AnyRow[]);
  }

  async function save(r: AnyRow) {
    try {
      setBusyId(r.id);
      setStatus("Saving…");
      const { error } = await supabase
        .from("sales_order_lines")
        .update({
          product_name: r?.product_name ?? "",
          qty: Number(r?.qty ?? 0),
          unit_price: Number(r?.unit_price ?? 0),
        })
        .eq("id", r.id);
      if (error) throw error;
      setStatus("Saved.");
    } catch (e: any) {
      alert(e?.message ?? "Failed to save");
    } finally {
      setBusyId(null);
      await refresh();
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this line? This cannot be undone.")) return;
    try {
      setBusyId(id);
      setStatus("Deleting…");
      const { error } = await supabase.from("sales_order_lines").delete().eq("id", id);
      if (error) throw error;
      setStatus("Deleted.");
    } catch (e: any) {
      alert(e?.message ?? "Failed to delete");
    } finally {
      setBusyId(null);
      await refresh();
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input
          className="border rounded px-3 py-2 w-full md:w-[340px]"
          placeholder="Search by product or date…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
          onClick={refresh}
        >
          Refresh
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900/60">
            <tr>
              <th className="p-2 text-left">Date</th>
              <th className="p-2 text-left">Product</th>
              <th className="p-2 text-right">Qty</th>
              <th className="p-2 text-right">Unit price</th>
              <th className="p-2 text-right">Revenue</th>
              <th className="p-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r: AnyRow) => {
              const date = r?.sales_orders?.occurred_at
                ? new Date(r.sales_orders.occurred_at).toLocaleDateString()
                : "—";
              const qty = Number(r?.qty ?? 0);
              const price = Number(r?.unit_price ?? 0);
              const revenue = qty * price;
              const disabled = busyId === r?.id;

              return (
                <tr key={r.id} className="border-t">
                  <td className="p-2">{date}</td>
                  <td className="p-2">
                    <input
                      className="w-full border rounded px-2 py-1"
                      value={r?.product_name ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, product_name: v } : x)));
                      }}
                    />
                  </td>
                  <td className="p-2 text-right">
                    <input
                      type="number"
                      step="1"
                      className="w-[120px] border rounded px-2 py-1 text-right"
                      value={qty}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, qty: v } : x)));
                      }}
                    />
                  </td>
                  <td className="p-2 text-right">
                    <input
                      type="number"
                      step="0.01"
                      className="w-[120px] border rounded px-2 py-1 text-right"
                      value={price}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, unit_price: v } : x)));
                      }}
                    />
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {revenue.toLocaleString(undefined, { style: "currency", currency: "USD" })}
                  </td>
                  <td className="p-2 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        disabled={disabled}
                        className="px-2 py-1 border rounded text-xs hover:bg-neutral-900 disabled:opacity-50"
                        onClick={() => save(r)}
                      >
                        Save
                      </button>
                      <button
                        disabled={disabled}
                        className="px-2 py-1 border rounded text-xs hover:bg-red-950 disabled:opacity-50"
                        onClick={() => remove(r.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td className="p-3 text-neutral-400" colSpan={6}>
                  No rows found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {status && <div className="text-xs opacity-80">{status}</div>}
    </div>
  );
}
