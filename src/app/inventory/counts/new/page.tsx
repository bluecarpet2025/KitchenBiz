import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Item = {
  id: string; name: string; base_unit: string;
};
type OnHand = { item_id: string; on_hand_base: number };

async function getTenant() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, tenantId: null };

  const { data: prof } = await supabase
    .from("profiles").select("tenant_id").eq("id", user.id).maybeSingle();

  return { supabase, user, tenantId: prof?.tenant_id ?? null };
}

export default async function NewCountPage() {
  const { supabase, user, tenantId } = await getTenant();
  if (!user || !tenantId) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">New Inventory Count</h1>
        <p className="mt-4">Sign in required.</p>
        <Link className="underline" href="/login?redirect=/inventory/counts/new">Go to login</Link>
      </main>
    );
  }

  const { data: items } = await supabase
    .from("inventory_items")
    .select("id,name,base_unit")
    .eq("tenant_id", tenantId)
    .order("name");

  const { data: oh } = await supabase
    .from("v_item_on_hand")
    .select("item_id,on_hand_base")
    .eq("tenant_id", tenantId);

  const onHandMap = Object.fromEntries((oh ?? []).map((r: OnHand) => [r.item_id, Number(r.on_hand_base || 0)]));

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">New Inventory Count</h1>
        <Link href="/inventory" className="underline text-sm">Back to Inventory</Link>
      </div>

      <p className="text-sm opacity-80">
        Enter today’s physical count. On commit, differences are recorded as adjustments (loss/overage).
      </p>

      <CountForm
        items={(items ?? []) as Item[]}
        expected={onHandMap}
        tenantId={tenantId}
      />
    </main>
  );
}

/* ---------- Client Form ---------- */

"use client";
import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type FormItem = Item & { expected: number; counted: string };

function toNum(x: string) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function CountForm({ items, expected, tenantId }: { items: Item[]; expected: Record<string, number>; tenantId: string }) {
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<FormItem[]>(
    items.map(it => ({ ...it, expected: expected[it.id] ?? 0, counted: "" }))
  );
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const deltas = useMemo(() => {
    return rows.map(r => toNum(r.counted) - (r.expected ?? 0));
  }, [rows]);

  async function quickAddNewItem(atIndex: number) {
    const name = window.prompt("New item name:");
    if (!name) return;
    // minimal defaults (editable later in Inventory)
    const { data, error } = await supabase
      .from("inventory_items")
      .insert({
        tenant_id: tenantId,
        name: name.trim(),
        base_unit: "g",
        purchase_unit: "kg",
        pack_to_base_factor: 1000,
        last_price: 0
      })
      .select("id,name,base_unit")
      .single();
    if (error || !data) { alert(error?.message ?? "Failed to create item"); return; }

    const row: FormItem = {
      id: data.id, name: data.name, base_unit: data.base_unit, expected: 0, counted: ""
    };
    setRows(prev => {
      const copy = prev.slice();
      copy.splice(atIndex, 0, row);
      return copy;
    });
    setStatus(`Created "${data.name}".`);
  }

  async function commit() {
    try {
      setBusy(true);
      setStatus("Saving…");

      // 1) Create count header
      const { data: c, error: cErr } = await supabase
        .from("inventory_counts")
        .insert({ tenant_id: tenantId, note })
        .select("id")
        .single();
      if (cErr) throw cErr;
      const countId = c!.id as string;

      // 2) Build lines + adjustments
      const lines = rows.map((r, i) => {
        const exp = Number(r.expected || 0);
        const cnt = toNum(r.counted);
        const delta = cnt - exp;
        return {
          idx: i, item_id: r.id, expected: exp, counted: cnt, delta
        };
      });

      // 3) Insert lines
      const lineRows = lines.map(l => ({
        count_id: countId,
        tenant_id: tenantId,
        item_id: l.item_id,
        expected_base: l.expected,
        counted_base: l.counted,
        delta_base: l.delta
      }));
      const { error: lErr } = await supabase.from("inventory_count_lines").insert(lineRows);
      if (lErr) throw lErr;

      // 4) Post adjustments for non-zero deltas
      const adjRows = lines
        .filter(l => Math.abs(l.delta) > 0)
        .map(l => ({
          tenant_id: tenantId,
          item_id: l.item_id,
          delta_base: l.delta,
          reason: "count",
          ref_count_id: countId,
          note
        }));
      if (adjRows.length) {
        const { error: aErr } = await supabase.from("inventory_adjustments").insert(adjRows);
        if (aErr) throw aErr;
      }

      setStatus("Count committed. Adjustments posted.");
    } catch (err: any) {
      console.error(err);
      alert(err.message ?? "Failed to commit count");
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
        onChange={e => setNote(e.target.value)}
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
            {rows.map((r, idx) => (
              <tr key={idx} className="border-t">
                <td className="p-2">
                  <div className="flex items-center gap-2">
                    <select
                      className="border rounded px-2 py-1"
                      value={r.id}
                      onChange={e => {
                        const id = e.target.value;
                        const item = items.find(it => it.id === id)!;
                        setRows(prev => prev.map((x, i) => i===idx
                          ? { ...x, id, name: item.name, base_unit: item.base_unit, expected: expected[id] ?? 0, counted: "" }
                          : x
                        ));
                      }}
                    >
                      {items.map(it => (
                        <option key={it.id} value={it.id}>{it.name}</option>
                      ))}
                    </select>
                    <button className="text-xs underline" onClick={() => quickAddNewItem(idx)}>+ New item</button>
                  </div>
                </td>
                <td className="p-2 text-right tabular-nums">{(r.expected ?? 0).toFixed(3)}</td>
                <td className="p-2">
                  <input
                    className="w-full border rounded px-2 py-1 text-right"
                    type="number" step="0.001"
                    value={r.counted}
                    onChange={e => {
                      const v = e.target.value;
                      setRows(prev => prev.map((x, i) => i===idx ? { ...x, counted: v } : x));
                    }}
                  />
                </td>
                <td className={`p-2 text-right tabular-nums ${deltas[idx]<0?'text-red-500':deltas[idx]>0?'text-emerald-500':''}`}>
                  {Number.isFinite(deltas[idx]) ? deltas[idx].toFixed(3) : '0.000'}
                </td>
                <td className="p-2">{r.base_unit}</td>
                <td className="p-2">
                  <button className="text-xs underline" onClick={() => setRows(prev => prev.filter((_,i)=>i!==idx))}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <button
          className="px-3 py-2 border rounded-md hover:bg-neutral-900"
          onClick={() => setRows(prev => [...prev, { ...items[0], expected: expected[items[0].id] ?? 0, counted: "" } as FormItem])}
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
