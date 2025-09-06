// src/components/CountFormClient.tsx
"use client";

import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Item = { id: string; name: string; base_unit: string | null };
type FormItem = Item & { expected: number; counted: string };

function toNum(x: string) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

export default function CountFormClient({
  items,
  expected,
  tenantId,
}: {
  items: Item[];
  expected: Record<string, number>;
  tenantId: string;
}) {
  // Local copy of item options so a newly created item appears instantly in <select>.
  const [itemOptions, setItemOptions] = useState<Item[]>(items);

  const [note, setNote] = useState("");
  const [rows, setRows] = useState<FormItem[]>(
    items.map((it) => ({
      ...it,
      expected: expected[it.id] ?? 0,
      counted: "",
    }))
  );
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const deltas = useMemo(
    () => rows.map((r) => toNum(r.counted) - (r.expected ?? 0)),
    [rows]
  );

  const hasNegativeCounts = useMemo(
    () => rows.some((r) => toNum(r.counted) < 0),
    [rows]
  );

  async function quickAddNewItem(atIndex: number) {
    const name = window.prompt("New item name:");
    if (!name) return;

    const { data, error } = await supabase
      .from("inventory_items")
      .insert({
        tenant_id: tenantId,
        name: name.trim(),
        base_unit: "g",
        purchase_unit: "kg",
        pack_to_base_factor: 1000,
        last_price: 0,
      })
      .select("id,name,base_unit")
      .single();

    if (error || !data) {
      alert(error?.message ?? "Failed to create item");
      return;
    }

    // Make the new item available in dropdowns immediately (fixes bug #4).
    setItemOptions((prev) => [...prev, data]);

    const row: FormItem = {
      id: data.id,
      name: data.name,
      base_unit: data.base_unit,
      expected: 0,
      counted: "",
    };

    setRows((prev) => {
      const copy = prev.slice();
      copy.splice(atIndex, 0, row);
      return copy;
    });

    setStatus(`Created "${data.name}".`);
  }

  async function commit() {
    try {
      if (hasNegativeCounts) {
        alert("You have one or more negative counts. Please fix before committing.");
        return;
      }

      // Build a preview summary for confirmation (non-destructive).
      const previewLines = rows
        .map((r, i) => ({
          name: r.name,
          expected: r.expected || 0,
          counted: toNum(r.counted),
          delta: deltas[i],
        }))
        .filter((x) => Math.abs(x.delta) > 0);

      const totalChanged = previewLines.length;
      const sample = previewLines.slice(0, 5);
      const sampleText = sample
        .map(
          (x) =>
            `• ${x.name}: expected ${x.expected.toFixed(3)}, counted ${x.counted.toFixed(
              3
            )}, Δ ${x.delta.toFixed(3)}`
        )
        .join("\n");

      const msg =
        totalChanged === 0
          ? "No changes detected (all deltas are zero). Commit anyway?"
          : `You are about to commit this count.\n\nLines that will change: ${totalChanged}\n\nPreview:\n${sampleText}${
              totalChanged > sample.length ? `\n…and ${totalChanged - sample.length} more` : ""
            }\n\nProceed?`;

      if (!window.confirm(msg)) return;

      setBusy(true);
      setStatus("Saving…");

      // 1) header
      const { data: c, error: cErr } = await supabase
        .from("inventory_counts")
        .insert({ tenant_id: tenantId, note })
        .select("id")
        .single();
      if (cErr) throw cErr;
      const countId = c!.id as string;

      // 2) lines + adjustments
      const lines = rows.map((r) => {
        const exp = Number(r.expected || 0);
        const cnt = toNum(r.counted);
        const delta = cnt - exp;
        return { item_id: r.id, expected: exp, counted: cnt, delta };
      });

      // 3) insert lines
      const lineRows = lines.map((l) => ({
        count_id: countId,
        tenant_id: tenantId,
        item_id: l.item_id,
        expected_base: l.expected,
        counted_base: l.counted,
        delta_base: l.delta,
      }));
      const { error: lErr } = await supabase
        .from("inventory_count_lines")
        .insert(lineRows);
      if (lErr) throw lErr;

      // 4) adjustments for non-zero deltas
      const adjRows = lines
        .filter((l) => Math.abs(l.delta) > 0)
        .map((l) => ({
          tenant_id: tenantId,
          item_id: l.item_id,
          delta_base: l.delta,
          reason: "count",
          ref_count_id: countId,
          note,
        }));
      if (adjRows.length) {
        const { error: aErr } = await supabase
          .from("inventory_adjustments")
          .insert(adjRows);
        if (aErr) throw aErr;
      }

      setStatus("Count committed. Adjustments posted.");
    } catch (err: any) {
      console.error(err);
      alert(err?.message ?? "Failed to commit count");
      setStatus("Error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <input
        className="w-full border rounded px-3 py-2"
        placeholder="Count note (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />

      <div className="overflow-x-auto">
        <table className="w-full text-sm table-auto">
          <thead>
            <tr className="text-left text-neutral-300">
              <th className="p-2">Item</th>
              <th className="p-2 text-right">Expected</th>
              <th className="p-2 text-right">Counted</th>
              <th className="p-2 text-right">Δ</th>
              <th className="p-2">Unit</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              const countedNum = toNum(r.counted);
              const isNegative = countedNum < 0;

              return (
                <tr key={`${r.id}-${idx}`} className="border-t">
                  <td className="p-2">
                    <div className="flex items-center gap-2">
                      <select
                        className="border rounded px-2 py-1"
                        value={r.id}
                        onChange={(e) => {
                          const id = e.target.value;
                          const item = itemOptions.find((it) => it.id === id)!;
                          setRows((prev) =>
                            prev.map((x, i) =>
                              i === idx
                                ? {
                                    ...x,
                                    id,
                                    name: item.name,
                                    base_unit: item.base_unit,
                                    expected: expected[id] ?? 0,
                                    counted: "",
                                  }
                                : x
                            )
                          );
                        }}
                      >
                        {itemOptions.map((it) => (
                          <option key={it.id} value={it.id}>
                            {it.name}
                          </option>
                        ))}
                      </select>
                      <button
                        className="text-xs underline"
                        onClick={() => quickAddNewItem(idx)}
                      >
                        + New item
                      </button>
                    </div>
                  </td>

                  <td className="p-2 text-right tabular-nums">
                    {(r.expected ?? 0).toFixed(3)}
                  </td>

                  <td className="p-2">
                    <input
                      className={`w-full border rounded px-2 py-1 text-right ${
                        isNegative ? "border-red-500/70 bg-red-950/20" : ""
                      }`}
                      type="number"
                      step="0.001"
                      value={r.counted}
                      onChange={(e) => {
                        const v = e.target.value;
                        setRows((prev) =>
                          prev.map((x, i) => (i === idx ? { ...x, counted: v } : x))
                        );
                      }}
                    />
                    {isNegative && (
                      <div className="mt-1 text-xs text-red-400">
                        Counted value can’t be negative.
                      </div>
                    )}
                  </td>

                  <td
                    className={`p-2 text-right tabular-nums ${
                      deltas[idx] < 0
                        ? "text-red-500"
                        : deltas[idx] > 0
                        ? "text-emerald-500"
                        : ""
                    }`}
                  >
                    {Number.isFinite(deltas[idx])
                      ? deltas[idx].toFixed(3)
                      : "0.000"}
                  </td>

                  <td className="p-2">{r.base_unit ?? ""}</td>

                  <td className="p-2">
                    <button
                      className="text-xs underline"
                      onClick={() =>
                        setRows((prev) => prev.filter((_, i) => i !== idx))
                      }
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <button
          className="px-3 py-2 border rounded-md hover:bg-neutral-900"
          onClick={() => {
            if (!itemOptions.length) return;
            const first = itemOptions[0];
            setRows((prev) => [
              ...prev,
              {
                ...first,
                expected: expected[first.id] ?? 0,
                counted: "",
              } as FormItem,
            ]);
          }}
        >
          + Add line
        </button>

        <button
          disabled={busy}
          onClick={commit}
          className="px-4 py-2 bg-white text-black rounded font-medium disabled:opacity-50"
        >
          Commit Count
        </button>
      </div>

      {status && <div className="text-sm opacity-80">{status}</div>}
    </div>
  );
}
