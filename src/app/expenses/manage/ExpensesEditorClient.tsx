"use client";

import { useEffect, useMemo, useState } from "react";
import createClient from "@/lib/supabase/client";

type Row = {
  id: string;
  occurred_at: string; // YYYY-MM-DD
  category: string;
  description: string | null;
  amount_usd: number;
};

export default function ExpensesEditorClient({
  tenantId,
  readOnly = false,
}: {
  tenantId: string; // pass "" if unknown
  readOnly?: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // New row form
  const [date, setDate] = useState<string>("");
  const [category, setCategory] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [amount, setAmount] = useState<string>("");

  const disabled = readOnly || !tenantId;

  async function load() {
    if (!tenantId) {
      setRows([]);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("expenses")
      .select("id, occurred_at, category, description, amount_usd")
      .eq("tenant_id", tenantId)
      .order("occurred_at", { ascending: false })
      .limit(1000);
    setLoading(false);
    if (error) {
      setMsg(error.message);
      return;
    }
    setRows(
      (data ?? []).map((r) => ({
        id: String((r as any).id),
        occurred_at: String((r as any).occurred_at).slice(0, 10),
        category: String((r as any).category ?? ""),
        description: ((r as any).description ?? null) as string | null,
        amount_usd: Number((r as any).amount_usd ?? 0),
      }))
    );
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  async function addOne() {
    if (disabled) return;
    const d = date.trim();
    const c = category.trim();
    const a = Number(amount);
    if (!d || !c || !Number.isFinite(a)) {
      setMsg("Please fill date, category, and a valid amount.");
      return;
    }
    const { error } = await supabase
      .from("expenses")
      .insert({
        tenant_id: tenantId,
        occurred_at: d,
        category: c,
        description: description.trim() || null,
        amount_usd: a,
      })
      .select("id")
      .maybeSingle();
    if (error) {
      setMsg(error.message);
      return;
    }
    setDate("");
    setCategory("");
    setDescription("");
    setAmount("");
    await load();
    setMsg("Added ✓");
    setTimeout(() => setMsg(null), 2000);
  }

  async function removeOne(id: string) {
    if (disabled) return;
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) {
      setMsg(error.message);
      return;
    }
    setRows((r) => r.filter((x) => x.id !== id));
  }

  function downloadTemplate() {
    const header = "date,category,description,amount_usd\n";
    const sample =
      "2025-01-15,Food,Flour and tomatoes,125.50\n2025-01-16,Labor,Saturday overtime,300.00\n";
    const blob = new Blob([header + sample], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "expenses_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function parseCsv(text: string) {
    // Very simple CSV parser for: date,category,description,amount_usd
    // (No embedded commas/quotes support; template matches this format.)
    const out: Array<{
      occurred_at: string;
      category: string;
      description: string | null;
      amount_usd: number;
    }> = [];
    const lines = text.replace(/\r/g, "").split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      if (i === 0 && /^date,category,description,amount_usd$/i.test(line)) {
        // header row
        continue;
      }
      const parts = line.split(",");
      if (parts.length < 4) continue;
      const occurred_at = parts[0].trim();
      const category = parts[1].trim();
      const description = parts[2].trim() || null;
      const amount_usd = Number(parts.slice(3).join(",").trim());
      if (!occurred_at || !category || !Number.isFinite(amount_usd)) continue;
      out.push({ occurred_at, category, description, amount_usd });
    }
    return out;
  }

  async function onUploadCsv(file: File) {
    if (disabled) return;
    const text = await file.text();
    const items = parseCsv(text);
    if (!items.length) {
      setMsg("CSV contained no valid rows.");
      return;
    }
    // Insert in small batches to avoid row limit
    const chunkSize = 500;
    for (let i = 0; i < items.length; i += chunkSize) {
      const chunk = items.slice(i, i + chunkSize).map((r) => ({
        tenant_id: tenantId,
        occurred_at: r.occurred_at,
        category: r.category,
        description: r.description,
        amount_usd: r.amount_usd,
      }));
      const { error } = await supabase.from("expenses").insert(chunk);
      if (error) {
        setMsg(error.message);
        return;
      }
    }
    await load();
    setMsg(`Imported ${items.length} row(s) ✓`);
    setTimeout(() => setMsg(null), 3000);
  }

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <button
          className="rounded border px-3 py-1 hover:bg-neutral-900 text-sm"
          onClick={downloadTemplate}
          type="button"
        >
          Download CSV Template
        </button>
        <label className={`rounded border px-3 py-1 text-sm ${disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-neutral-900 cursor-pointer"}`}>
          Upload CSV
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            disabled={disabled}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUploadCsv(f);
              e.currentTarget.value = "";
            }}
          />
        </label>
        {tenantId ? (
          <span className="text-xs opacity-70">Tenant: {tenantId}</span>
        ) : (
          <span className="text-xs text-rose-400">No tenant resolved</span>
        )}
      </div>

      {msg && <div className="mb-3 text-sm rounded px-3 py-2 bg-neutral-800">{msg}</div>}

      {/* Add form */}
      <div className="border rounded p-3 mb-4">
        <div className="text-sm opacity-80 mb-2">Add expense</div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
          <input
            type="date"
            className="bg-neutral-900 border rounded px-2 py-1"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={disabled}
            placeholder="YYYY-MM-DD"
          />
          <input
            className="bg-neutral-900 border rounded px-2 py-1"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            disabled={disabled}
            placeholder="Category (e.g., Food)"
          />
          <input
            className="bg-neutral-900 border rounded px-2 py-1"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={disabled}
            placeholder="Description (optional)"
          />
          <input
            className="bg-neutral-900 border rounded px-2 py-1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={disabled}
            placeholder="Amount (e.g., 125.50)"
          />
          <button
            type="button"
            onClick={addOne}
            disabled={disabled}
            className="rounded border px-3 py-1 hover:bg-neutral-900 disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="opacity-80">
            <tr>
              <th className="text-left font-normal px-2 py-1">Date</th>
              <th className="text-left font-normal px-2 py-1">Category</th>
              <th className="text-left font-normal px-2 py-1">Description</th>
              <th className="text-right font-normal px-2 py-1">Amount</th>
              <th className="text-right font-normal px-2 py-1">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-2 py-2" colSpan={5}>
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="px-2 py-2" colSpan={5}>
                  No expenses yet.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-2 py-1">{r.occurred_at}</td>
                  <td className="px-2 py-1">{r.category}</td>
                  <td className="px-2 py-1">{r.description ?? ""}</td>
                  <td className="px-2 py-1 text-right">
                    {new Intl.NumberFormat(undefined, {
                      style: "currency",
                      currency: "USD",
                    }).format(r.amount_usd)}
                  </td>
                  <td className="px-2 py-1 text-right">
                    <button
                      className="rounded border px-2 py-0.5 hover:bg-neutral-900 disabled:opacity-50"
                      onClick={() => removeOne(r.id)}
                      disabled={disabled}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
