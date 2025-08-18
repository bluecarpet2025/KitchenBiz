"use client";
import { useMemo, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/browser";

type Item = { id: string; name: string; base_unit: string | null };
type Row = { item_id: string; name: string; base_unit: string; counted_qty: number };
type Props = { items: Item[]; expectedMap: Record<string, number> };

export default function CountForm({ items, expectedMap }: Props) {
  const supabase = createBrowserClient();
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<Row[]>(
    () =>
      items.map(it => ({
        item_id: it.id,
        name: it.name,
        base_unit: it.base_unit || "",
        counted_qty: Number(expectedMap[it.id] ?? 0),
      })) as Row[]
  );
  const [saving, setSaving] = useState(false);
  const totalLines = rows.length;

  const deltas = useMemo(
    () =>
      rows.map(r => {
        const expected = Number(expectedMap[r.item_id] ?? 0);
        const delta = Number(r.counted_qty) - expected;
        return { ...r, expected, delta };
      }),
    [rows, expectedMap]
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const { data: profile } = await supabase
        .from("profiles")
        .select("tenant_id")
        .eq("id", user.id)
        .single();
      const tenantId = profile?.tenant_id;
      if (!tenantId) throw new Error("No tenant");

      // 1) header
      const { data: count, error: cErr } = await supabase
        .from("inventory_counts")
        .insert({ tenant_id: tenantId, note, created_by: user.id, status: "draft" })
        .select("id")
        .single();
      if (cErr) throw cErr;

      // 2) lines
      const linePayload = rows.map(r => ({
        tenant_id: tenantId,
        count_id: count.id,
        item_id: r.item_id,
        counted_qty: Number(r.counted_qty) || 0,
      }));
      const { error: lErr } = await supabase.from("inventory_count_lines").insert(linePayload);
      if (lErr) throw lErr;

      // 3) commit
      const { data: results, error: rpcErr } = await supabase.rpc("commit_inventory_count", {
        p_count_id: count.id,
        p_actor: user.id,
      });
      if (rpcErr) throw rpcErr;

      const loss = (results || []).filter((r: any) => r.status === "loss").length;
      const over = (results || []).filter((r: any) => r.status === "overage").length;

      alert(`Count committed.\nLines: ${totalLines}\nLosses: ${loss}\nOverages: ${over}`);
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Error committing count");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4">
      <label className="text-sm block">
        Count note (optional)
        <input
          className="mt-1 w-full border rounded-md px-2 py-1"
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="e.g., End of day 8/17, John M."
        />
      </label>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-2">Item</th>
              <th className="text-right p-2">Expected</th>
              <th className="text-right p-2">Counted</th>
              <th className="text-right p-2">Δ</th>
              <th className="text-left p-2">Unit</th>
            </tr>
          </thead>
          <tbody>
            {deltas.map((r, idx) => (
              <tr key={r.item_id} className="border-t">
                <td className="p-2">{r.name}</td>
                <td className="p-2 text-right tabular-nums">{fmt(r.expected)}</td>
                <td className="p-2">
                  <input
                    type="number"
                    step="0.01"
                    className="w-full border rounded-md px-2 py-1 text-right"
                    value={rows[idx].counted_qty}
                    onChange={e =>
                      setRows(prev =>
                        prev.map((x, i) =>
                          i === idx
                            ? { ...x, counted_qty: Number(e.target.value) } // <-- number, not string
                            : x
                        )
                      )
                    }
                  />
                </td>
                <td
                  className={`p-2 text-right tabular-nums ${
                    r.delta < 0 ? "text-red-600" : r.delta > 0 ? "text-emerald-600" : ""
                  }`}
                >
                  {fmt(r.delta)}
                </td>
                <td className="p-2">{r.base_unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button disabled={saving} className="px-3 py-2 rounded-md border hover:bg-muted">
        {saving ? "Committing…" : "Commit Count"}
      </button>
    </form>
  );
}

function fmt(n: number) {
  return Number.isInteger(n)
    ? String(n)
    : (Math.abs(n) < 10 ? n.toFixed(2) : n.toFixed(1)).replace(/\.0$/, "");
}
