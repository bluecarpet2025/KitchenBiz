"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type AnyRow = any;

export default function ExpensesEditorClient({ initialRows }: { initialRows: AnyRow[] }) {
  const [rows, setRows] = useState<AnyRow[]>(initialRows);
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => setRows(initialRows), [initialRows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      (r?.category ?? "").toLowerCase().includes(needle) ||
      (r?.description ?? "").toLowerCase().includes(needle)
    );
  }, [q, rows]);

  async function refresh() {
    const { data } = await supabase
      .from("expenses")
      .select("id, occurred_at, category, description, amount")
      .order("occurred_at", { ascending: false })
      .limit(250);
    setRows((data ?? []) as AnyRow[]);
  }

  async function save(r: AnyRow) {
    try {
      setBusyId(r.id);
      setStatus("Saving…");
      const { error } = await supabase
        .from("expenses")
        .update({
          occurred_at: r?.occurred_at ? new Date(r.occurred_at).toISOString() : null,
          category: (r?.category ?? null) as any,
          description: (r?.description ?? null) as any,
          amount: Number(r?.amount ?? 0),
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
    if (!confirm("Delete this expense? This cannot be undone.")) return;
    try {
      setBusyId(id);
      setStatus("Deleting…");
      const { error } = await supabase.from("expenses").delete().eq("id", id);
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
          className="border rounded px-3 py-2 w-full md:w-[360px]"
          placeholder="Search by category or description…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900" onClick={refresh}>
          Refresh
        </button>
      </div>

      <div className="overflow-x-auto">
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
            {filtered.map((r: AnyRow) => {
              const date = r?.occurred_at
                ? new Date(r.occurred_at).toISOString().slice(0, 10)
                : "";
              const disabled = busyId === r?.id;
              return (
                <tr key={r.id} className="border-t">
                  <td className="p-2">
                    <input
                      type="date"
                      className="border rounded px-2 py-1"
                      value={date}
                      onChange={(e) => {
                        const v = e.target.value ? new Date(e.target.value) : null;
                        setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, occurred_at: v } : x)));
                      }}
                    />
                  </td>
                  <td className="p-2">
                    <input
                      className="w-full border rounded px-2 py-1"
                      value={r?.category ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, category: v } : x)));
                      }}
                    />
                  </td>
                  <td className="p-2">
                    <input
                      className="w-full border rounded px-2 py-1"
                      value={r?.description ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, description: v } : x)));
                      }}
                    />
                  </td>
                  <td className="p-2 text-right">
                    <input
                      type="number"
                      step="0.01"
                      className="w-[140px] border rounded px-2 py-1 text-right"
                      value={Number(r?.amount ?? 0)}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, amount: v } : x)));
                      }}
                    />
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
                <td className="p-3 text-neutral-400" colSpan={5}>
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
