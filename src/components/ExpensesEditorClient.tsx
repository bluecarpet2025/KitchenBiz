"use client";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type ExpRow = {
  id?: string;
  isNew?: boolean;
  occurred_at: string; // yyyy-mm-dd
  category: string;
  description: string;
  amount_usd: number;
};

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export default function ExpensesEditorClient({ tenantId }: { tenantId: string }) {
  const [rows, setRows] = useState<ExpRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setBusy(true);
      try {
        const { data, error } = await supabase
          .from("expenses")
          .select("id,occurred_at,category,description,amount_usd")
          .eq("tenant_id", tenantId)
          .order("occurred_at", { ascending: false })
          .limit(200);
        if (error) throw error;

        const mapped = (data ?? []).map((r: any) => ({
          id: r.id as string,
          occurred_at: r.occurred_at
            ? new Date(r.occurred_at).toISOString().slice(0, 10)
            : todayISO(),
          category: r.category ?? "",
          description: r.description ?? "",
          amount_usd: Number(r.amount_usd || 0),
        })) as ExpRow[];
        setRows(mapped);
      } catch (e: any) {
        console.error(e);
        setStatus(e?.message ?? "Failed to load expenses.");
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
        category: "",
        description: "",
        amount_usd: 0,
      },
      ...prev,
    ]);
  }

  function update(idx: number, patch: Partial<ExpRow>) {
    setRows(prev => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], ...patch };
      return copy;
    });
  }

  async function saveRow(idx: number) {
    const r = rows[idx];
    try {
      setBusy(true);
      setStatus(null);

      if (!r.category) {
        alert("Please enter a category.");
        return;
      }
      if (!Number.isFinite(r.amount_usd)) {
        alert("Amount must be a valid number.");
        return;
      }

      const occurredAt = new Date(`${r.occurred_at}T00:00:00Z`).toISOString();

      if (r.isNew) {
        const { data, error } = await supabase
          .from("expenses")
          .insert({
            tenant_id: tenantId,
            occurred_at: occurredAt,
            category: r.category,
            description: r.description,
            amount_usd: r.amount_usd,
          })
          .select("id")
          .single();
        if (error) throw error;

        setRows(prev => {
          const copy = [...prev];
          copy[idx] = { ...r, id: data!.id as string, isNew: false };
          return copy;
        });
        setStatus("Expense created.");
      } else {
        if (!r.id) throw new Error("Missing id to update.");
        const { error } = await supabase
          .from("expenses")
          .update({
            occurred_at: occurredAt,
            category: r.category,
            description: r.description,
            amount_usd: r.amount_usd,
          })
          .eq("id", r.id)
          .eq("tenant_id", tenantId);
        if (error) throw error;
        setStatus("Expense saved.");
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
    if (!confirm("Delete this expense?")) return;
    try {
      setBusy(true);
      const { error } = await supabase
        .from("expenses")
        .delete()
        .eq("id", r.id)
        .eq("tenant_id", tenantId);
      if (error) throw error;
      setRows(prev => prev.filter((_, i) => i !== idx));
      setStatus("Expense deleted.");
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "Delete failed.");
    } finally {
      setBusy(false);
    }
  }

  const fmtUSD = useMemo(
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
              <th className="p-2 text-left">Category</th>
              <th className="p-2 text-left">Description</th>
              <th className="p-2 text-right">Amount</th>
              <th className="p-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={r.id ?? `new-${idx}`} className="border-t">
                <td className="p-2">
                  <input
                    type="date"
                    className="border rounded px-2 py-1 bg-neutral-950"
                    value={r.occurred_at}
                    onChange={e => update(idx, { occurred_at: e.target.value })}
                  />
                </td>
                <td className="p-2">
                  <input
                    className="border rounded px-2 py-1 w-56 bg-neutral-950"
                    value={r.category}
                    onChange={e => update(idx, { category: e.target.value })}
                  />
                </td>
                <td className="p-2">
                  <input
                    className="border rounded px-2 py-1 w-full bg-neutral-950"
                    value={r.description}
                    onChange={e => update(idx, { description: e.target.value })}
                  />
                </td>
                <td className="p-2 text-right">
                  <input
                    type="number"
                    step="0.01"
                    className="border rounded px-2 py-1 w-28 text-right bg-neutral-950"
                    value={r.amount_usd}
                    onChange={e => update(idx, { amount_usd: Number(e.target.value) })}
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
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="p-3 text-neutral-400">
                  No expenses yet. Click “Add row” to create your first entry.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot className="bg-neutral-900/40">
            <tr>
              <td className="p-2 font-medium" colSpan={3}>Total (shown)</td>
              <td className="p-2 text-right font-medium">
                {fmtUSD(rows.reduce((a, r) => a + Number(r.amount_usd || 0), 0))}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
