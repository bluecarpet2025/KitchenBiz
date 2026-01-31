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

const PRESET_CATEGORIES = [
  { label: "Food", value: "Food", hint: "Ingredients, packaging, disposables (food-side)" },
  { label: "Beverage", value: "Beverage", hint: "Drinks, syrups, coffee, bar items" },
  { label: "Labor", value: "Labor", hint: "Payroll, contractors, temp labor" },
  { label: "Rent", value: "Rent", hint: "Lease / rent payments" },
  { label: "Utilities", value: "Utilities", hint: "Electric, gas, water, internet" },
  { label: "Marketing", value: "Marketing", hint: "Ads, promos, printing, design" },
  { label: "Misc", value: "Misc", hint: "Everything else" },
] as const;

const CUSTOM_VALUE = "__custom__";

function normalizeCategory(raw: string) {
  const k = String(raw ?? "").trim();
  if (!k) return "";
  // Keep the user's casing, but we standardize common ones to match reporting buckets.
  const low = k.toLowerCase();
  if (low === "food") return "Food";
  if (low === "beverage" || low === "drinks" || low === "drink") return "Beverage";
  if (low === "labor") return "Labor";
  if (low === "rent") return "Rent";
  if (low === "utilities" || low === "utility") return "Utilities";
  if (low === "marketing") return "Marketing";
  if (low === "misc" || low === "other") return "Misc";
  return k;
}

export default function ExpensesEditorClient({ tenantId }: { tenantId: string }) {
  const [rows, setRows] = useState<ExpRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  // New-row helper inputs (for better UX than a blank category field)
  const [newPreset, setNewPreset] = useState<string>(PRESET_CATEGORIES[0].value);
  const [newCustom, setNewCustom] = useState<string>("");

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
          occurred_at: r.occurred_at ? new Date(r.occurred_at).toISOString().slice(0, 10) : todayISO(),
          category: normalizeCategory(r.category ?? ""),
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
    const category =
      newPreset === CUSTOM_VALUE ? normalizeCategory(newCustom) : normalizeCategory(newPreset);

    setRows((prev) => [
      {
        isNew: true,
        occurred_at: todayISO(),
        category: category || "",
        description: "",
        amount_usd: 0,
      },
      ...prev,
    ]);
  }

  function update(idx: number, patch: Partial<ExpRow>) {
    setRows((prev) => {
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

      const category = normalizeCategory(r.category);
      if (!category) {
        alert("Please select a category (or enter one).");
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
            category,
            description: r.description?.trim() || null,
            amount_usd: r.amount_usd, // ✅ allow negatives
          })
          .select("id")
          .single();

        if (error) throw error;

        setRows((prev) => {
          const copy = [...prev];
          copy[idx] = { ...r, id: data!.id as string, isNew: false, category };
          return copy;
        });

        setStatus("Expense created.");
      } else {
        if (!r.id) throw new Error("Missing id to update.");

        const { error } = await supabase
          .from("expenses")
          .update({
            occurred_at: occurredAt,
            category,
            description: r.description?.trim() || null,
            amount_usd: r.amount_usd, // ✅ allow negatives
          })
          .eq("id", r.id)
          .eq("tenant_id", tenantId);

        if (error) throw error;

        setRows((prev) => {
          const copy = [...prev];
          copy[idx] = { ...copy[idx], category };
          return copy;
        });

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
      setRows((prev) => prev.filter((_, i) => i !== idx));
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

      setRows((prev) => prev.filter((_, i) => i !== idx));
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

  const shownTotal = rows.reduce((a, r) => a + Number(r.amount_usd || 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col">
            <label className="text-xs opacity-70 mb-1">New row category</label>
            <select
              className="border rounded px-2 py-1 bg-neutral-950"
              value={newPreset}
              onChange={(e) => setNewPreset(e.target.value)}
              disabled={busy}
            >
              {PRESET_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
              <option value={CUSTOM_VALUE}>Custom…</option>
            </select>
          </div>

          {newPreset === CUSTOM_VALUE && (
            <div className="flex flex-col">
              <label className="text-xs opacity-70 mb-1">Custom category</label>
              <input
                className="border rounded px-2 py-1 w-56 bg-neutral-950"
                value={newCustom}
                onChange={(e) => setNewCustom(e.target.value)}
                placeholder="e.g., Insurance"
                disabled={busy}
              />
            </div>
          )}

          <button
            disabled={busy}
            onClick={addRow}
            className="px-3 py-2 border rounded hover:bg-neutral-900 disabled:opacity-50"
          >
            + Add row
          </button>

          <div className="text-xs opacity-60">
            Tip: use negative amounts for refunds/credits (example: <span className="tabular-nums">-25.00</span>)
          </div>
        </div>

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
                    onChange={(e) => update(idx, { occurred_at: e.target.value })}
                  />
                </td>

                <td className="p-2">
                  <input
                    className="border rounded px-2 py-1 w-56 bg-neutral-950"
                    value={r.category}
                    onChange={(e) => update(idx, { category: e.target.value })}
                    placeholder="Food / Beverage / Rent / etc."
                  />
                  <div className="text-[11px] opacity-60 mt-1">
                    Standard buckets: Food, Beverage, Labor, Rent, Utilities, Marketing, Misc (or your own)
                  </div>
                </td>

                <td className="p-2">
                  <input
                    className="border rounded px-2 py-1 w-full bg-neutral-950"
                    value={r.description}
                    onChange={(e) => update(idx, { description: e.target.value })}
                    placeholder="Optional note (vendor, invoice, reason, etc.)"
                  />
                </td>

                <td className="p-2 text-right">
                  <input
                    type="number"
                    step="0.01"
                    className="border rounded px-2 py-1 w-32 text-right bg-neutral-950 tabular-nums"
                    value={Number.isFinite(r.amount_usd) ? r.amount_usd : 0}
                    onChange={(e) => update(idx, { amount_usd: Number(e.target.value) })}
                  />
                  <div className="text-[11px] opacity-60 mt-1 text-right">
                    Negatives allowed (credits/refunds)
                  </div>
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
              <td className="p-2 font-medium" colSpan={3}>
                Total (shown)
              </td>
              <td className="p-2 text-right font-medium tabular-nums">
                {fmtUSD(shownTotal)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
