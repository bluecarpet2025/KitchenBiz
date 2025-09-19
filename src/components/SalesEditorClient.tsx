"use client";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type LineRow = {
  id?: string;         // line id (db)
  order_id?: string;   // order id (db)
  isNew?: boolean;     // UI flag for new unsaved row
  occurred_at: string; // yyyy-mm-dd
  product_name: string;
  qty: number;
  unit_price: number;
  source?: string | null;
  channel?: string | null;
};

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function SalesEditorClient({ tenantId }: { tenantId: string }) {
  const [rows, setRows] = useState<LineRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  // Load initial lines (latest 200) + stitch orders to get occurred_at/source/channel
  useEffect(() => {
    (async () => {
      setBusy(true);
      try {
        const { data: lines, error: lineErr } = await supabase
          .from("sales_order_lines")
          .select("id,order_id,product_name,qty,unit_price")
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false })
          .limit(200);
        if (lineErr) throw lineErr;

        const orderIds = Array.from(new Set((lines ?? []).map((l: any) => l.order_id)));
        let ordersById = new Map<string, any>();
        if (orderIds.length) {
          const { data: ords, error: ordErr } = await supabase
            .from("sales_orders")
            .select("id,occurred_at,source,channel")
            .in("id", orderIds);
          if (ordErr) throw ordErr;
          (ords ?? []).forEach((o: any) => ordersById.set(o.id, o));
        }

        const initial = (lines ?? []).map((l: any) => {
          const o = ordersById.get(l.order_id) || {};
          const occurred = o.occurred_at
            ? new Date(o.occurred_at).toISOString().slice(0, 10)
            : todayISO();
          return {
            id: l.id as string,
            order_id: l.order_id as string,
            product_name: l.product_name || "",
            qty: Number(l.qty || 0),
            unit_price: Number(l.unit_price || 0),
            occurred_at: occurred,
            source: o.source ?? null,
            channel: o.channel ?? null,
          } as LineRow;
        });
        setRows(initial);
      } catch (e: any) {
        console.error(e);
        setStatus(e?.message ?? "Failed to load sales.");
      } finally {
        setBusy(false);
      }
    })();
  }, [tenantId]);

  function addRow() {
    setRows(prev => [
      {
        isNew: true,
        occurred_at: todayISO(),
        product_name: "",
        qty: 1,
        unit_price: 0,
        source: "manual",
        channel: "manual",
      },
      ...prev,
    ]);
  }

  async function saveRow(idx: number) {
    try {
      setBusy(true);
      setStatus(null);
      const r = rows[idx];
      if (!r.product_name || !Number.isFinite(r.qty) || r.qty <= 0) {
        alert("Please enter a product name and a positive quantity.");
        return;
      }
      if (!Number.isFinite(r.unit_price) || r.unit_price < 0) {
        alert("Unit price must be ≥ 0.");
        return;
      }
      const occurredAt = new Date(`${r.occurred_at}T00:00:00Z`).toISOString();

      if (r.isNew) {
        // Create order then line
        const { data: ord, error: ordErr } = await supabase
          .from("sales_orders")
          .insert({
            tenant_id: tenantId,
            occurred_at: occurredAt,
            source: r.source ?? "manual",
            channel: r.channel ?? "manual",
          })
          .select("id")
          .single();
        if (ordErr) throw ordErr;
        const orderId = ord!.id as string;

        const { data: ins, error: lineErr } = await supabase
          .from("sales_order_lines")
          .insert({
            tenant_id: tenantId,
            order_id: orderId,
            product_name: r.product_name,
            qty: r.qty,
            unit_price: r.unit_price,
          })
          .select("id")
          .single();
        if (lineErr) throw lineErr;

        // Refresh just this row
        setRows(prev => {
          const copy = [...prev];
          copy[idx] = {
            ...r,
            id: ins!.id as string,
            order_id: orderId,
            isNew: false,
          };
          return copy;
        });
        setStatus("Row created.");
      } else {
        // Update line + order date if changed
        if (!r.id || !r.order_id) throw new Error("Missing ids to update.");
        const { error: u1 } = await supabase
          .from("sales_order_lines")
          .update({
            product_name: r.product_name,
            qty: r.qty,
            unit_price: r.unit_price,
          })
          .eq("id", r.id)
          .eq("tenant_id", tenantId);
        if (u1) throw u1;

        const { error: u2 } = await supabase
          .from("sales_orders")
          .update({
            occurred_at: occurredAt,
            source: r.source ?? "manual",
            channel: r.channel ?? "manual",
          })
          .eq("id", r.order_id)
          .eq("tenant_id", tenantId);
        if (u2) throw u2;

        setStatus("Row saved.");
      }
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteRow(idx: number) {
    const r = rows[idx];
    if (r.isNew) {
      setRows(prev => prev.filter((_, i) => i !== idx));
      return;
    }
    if (!r.id) return;
    if (!confirm("Delete this sales line?")) return;
    try {
      setBusy(true);
      const { error } = await supabase
        .from("sales_order_lines")
        .delete()
        .eq("id", r.id)
        .eq("tenant_id", tenantId);
      if (error) throw error;
      setRows(prev => prev.filter((_, i) => i !== idx));
      setStatus("Row deleted.");
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "Delete failed.");
    } finally {
      setBusy(false);
    }
  }

  function update(idx: number, patch: Partial<LineRow>) {
    setRows(prev => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], ...patch };
      return copy;
    });
  }

  const currency = useMemo(
    () => (n: number) => n.toLocaleString(undefined, { style: "currency", currency: "USD" }),
    []
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button
          disabled={busy}
          onClick={addRow}
          className="px-3 py-2 border rounded hover:bg-neutral-900 disabled:opacity-50"
        >
          + Add row
        </button>
        {status && <div className="text-sm text-emerald-400">{status}</div>}
      </div>

      <div className="border rounded overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900/60">
            <tr>
              <th className="p-2 text-left">Date</th>
              <th className="p-2 text-left">Product</th>
              <th className="p-2 text-right">Qty</th>
              <th className="p-2 text-right">Unit $</th>
              <th className="p-2 text-right">Line total</th>
              <th className="p-2 text-left">Source</th>
              <th className="p-2 text-left">Channel</th>
              <th className="p-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              const total = Number(r.qty || 0) * Number(r.unit_price || 0);
              return (
                <tr key={(r.id ?? `new-${idx}`) + String(r.order_id ?? "")} className="border-t">
                  <td className="p-2">
                    <input
                      type="date"
                      className="border rounded px-2 py-1 bg-neutral-950"
                      value={r.occurred_at}
                      onChange={(e) => update(idx, { occurred_at: e.target.value })}
                    />
                  </td>
                  <td className="p-2">
                    <input
                      className="border rounded px-2 py-1 w-full bg-neutral-950"
                      value={r.product_name}
                      onChange={(e) => update(idx, { product_name: e.target.value })}
                    />
                  </td>
                  <td className="p-2 text-right">
                    <input
                      type="number"
                      step="1"
                      className="border rounded px-2 py-1 w-24 text-right bg-neutral-950"
                      value={r.qty}
                      onChange={(e) => update(idx, { qty: Number(e.target.value) })}
                    />
                  </td>
                  <td className="p-2 text-right">
                    <input
                      type="number"
                      step="0.01"
                      className="border rounded px-2 py-1 w-28 text-right bg-neutral-950"
                      value={r.unit_price}
                      onChange={(e) => update(idx, { unit_price: Number(e.target.value) })}
                    />
                  </td>
                  <td className="p-2 text-right tabular-nums">{currency(total)}</td>
                  <td className="p-2">
                    <input
                      className="border rounded px-2 py-1 w-32 bg-neutral-950"
                      value={r.source ?? ""}
                      onChange={(e) => update(idx, { source: e.target.value })}
                    />
                  </td>
                  <td className="p-2">
                    <input
                      className="border rounded px-2 py-1 w-32 bg-neutral-950"
                      value={r.channel ?? ""}
                      onChange={(e) => update(idx, { channel: e.target.value })}
                    />
                  </td>
                  <td className="p-2 text-right space-x-2">
                    <button
                      disabled={busy}
                      onClick={() => saveRow(idx)}
                      className="px-3 py-1 border rounded hover:bg-neutral-900 disabled:opacity-50"
                    >
                      {r.isNew ? "Create" : "Save"}
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => deleteRow(idx)}
                      className="px-3 py-1 border rounded hover:bg-neutral-900 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td className="p-3 text-neutral-400" colSpan={8}>
                  No sales yet. Click “Add row” to create your first entry.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
