"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Row = {
  id?: string;
  first_name: string;
  last_name: string;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
  pay_type?: string | null;
  pay_rate_usd?: number | null;
  hire_date?: string | null;
  end_date?: string | null;
  is_active?: boolean | null;
  notes?: string | null;
};

export default function StaffEditorClient({
  tenantId,
  initialRows,
}: {
  tenantId: string;
  initialRows: Row[];
}) {
  const [rows, setRows] = useState<Row[]>(
    (initialRows ?? []).map((r) => ({
      ...r,
      pay_rate_usd: r.pay_rate_usd ?? 0,
      pay_type: r.pay_type ?? "hourly",
      is_active: r.is_active ?? true,
    }))
  );
  const [busy, setBusy] = useState(false);
  const supabase = createClient();

  function addRow() {
    setRows((rs) => [
      {
        first_name: "",
        last_name: "",
        email: "",
        phone: "",
        role: "",
        pay_type: "hourly",
        pay_rate_usd: 0,
        hire_date: null,
        end_date: null,
        is_active: true,
        notes: "",
      },
      ...rs,
    ]);
  }

  async function save(idx: number) {
    try {
      setBusy(true);
      const r = rows[idx];

      const payload = {
        ...r,
        tenant_id: tenantId,
        pay_rate_usd:
          r.pay_rate_usd === null || r.pay_rate_usd === undefined
            ? 0
            : Number(r.pay_rate_usd),
      };

      let q = supabase.from("employees");
      const { data, error } = r.id
        ? await q.update(payload).eq("id", r.id).select().maybeSingle()
        : await q.insert(payload).select().maybeSingle();

      if (error) throw error;

      // Replace row with returned (has id & computed display_name)
      const saved = data as any;
      setRows((rs) => {
        const copy = [...rs];
        copy[idx] = {
          ...saved,
        };
        return copy;
      });
      alert("Saved.");
    } catch (e: any) {
      alert(e.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function del(idx: number) {
    const r = rows[idx];
    if (!r.id) {
      setRows((rs) => rs.filter((_, i) => i !== idx));
      return;
    }
    if (!confirm("Delete this employee?")) return;
    try {
      setBusy(true);
      const { error } = await supabase.from("employees").delete().eq("id", r.id);
      if (error) throw error;
      setRows((rs) => rs.filter((_, i) => i !== idx));
    } catch (e: any) {
      alert(e.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="p-3 border-b flex items-center justify-between">
        <button
          onClick={addRow}
          className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
          disabled={busy}
        >
          + Add row
        </button>
        {busy && <div className="text-xs opacity-70">Working…</div>}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900/60">
            <tr>
              <th className="p-2 text-left">First</th>
              <th className="p-2 text-left">Last</th>
              <th className="p-2 text-left">Email</th>
              <th className="p-2 text-left">Phone</th>
              <th className="p-2 text-left">Role</th>
              <th className="p-2">Type</th>
              <th className="p-2 text-right">Rate</th>
              <th className="p-2">Hire</th>
              <th className="p-2">End</th>
              <th className="p-2">Active</th>
              <th className="p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id ?? `new-${i}`} className="border-t">
                <td className="p-1">
                  <input
                    className="w-full bg-transparent border rounded px-2 py-1"
                    value={r.first_name ?? ""}
                    onChange={(e) =>
                      setRows((rs) => {
                        const c = [...rs];
                        c[i] = { ...c[i], first_name: e.target.value };
                        return c;
                      })
                    }
                  />
                </td>
                <td className="p-1">
                  <input
                    className="w-full bg-transparent border rounded px-2 py-1"
                    value={r.last_name ?? ""}
                    onChange={(e) =>
                      setRows((rs) => {
                        const c = [...rs];
                        c[i] = { ...c[i], last_name: e.target.value };
                        return c;
                      })
                    }
                  />
                </td>
                <td className="p-1">
                  <input
                    className="w-full bg-transparent border rounded px-2 py-1"
                    value={r.email ?? ""}
                    onChange={(e) =>
                      setRows((rs) => {
                        const c = [...rs];
                        c[i] = { ...c[i], email: e.target.value };
                        return c;
                      })
                    }
                  />
                </td>
                <td className="p-1">
                  <input
                    className="w-full bg-transparent border rounded px-2 py-1"
                    value={r.phone ?? ""}
                    onChange={(e) =>
                      setRows((rs) => {
                        const c = [...rs];
                        c[i] = { ...c[i], phone: e.target.value };
                        return c;
                      })
                    }
                  />
                </td>
                <td className="p-1">
                  <input
                    className="w-full bg-transparent border rounded px-2 py-1"
                    value={r.role ?? ""}
                    onChange={(e) =>
                      setRows((rs) => {
                        const c = [...rs];
                        c[i] = { ...c[i], role: e.target.value };
                        return c;
                      })
                    }
                  />
                </td>
                <td className="p-1 text-center">
                  <select
                    className="bg-transparent border rounded px-2 py-1"
                    value={r.pay_type ?? "hourly"}
                    onChange={(e) =>
                      setRows((rs) => {
                        const c = [...rs];
                        c[i] = { ...c[i], pay_type: e.target.value };
                        return c;
                      })
                    }
                  >
                    <option value="hourly">hourly</option>
                    <option value="salary">salary</option>
                    <option value="contract">contract</option>
                  </select>
                </td>
                <td className="p-1">
                  <input
                    type="number"
                    step="0.01"
                    className="w-full bg-transparent border rounded px-2 py-1 text-right"
                    value={r.pay_rate_usd ?? 0}
                    onChange={(e) =>
                      setRows((rs) => {
                        const c = [...rs];
                        c[i] = {
                          ...c[i],
                          pay_rate_usd:
                            e.target.value === "" ? 0 : Number(e.target.value),
                        };
                        return c;
                      })
                    }
                  />
                </td>
                <td className="p-1">
                  <input
                    type="date"
                    className="bg-transparent border rounded px-2 py-1"
                    value={r.hire_date ?? ""}
                    onChange={(e) =>
                      setRows((rs) => {
                        const c = [...rs];
                        c[i] = { ...c[i], hire_date: e.target.value };
                        return c;
                      })
                    }
                  />
                </td>
                <td className="p-1">
                  <input
                    type="date"
                    className="bg-transparent border rounded px-2 py-1"
                    value={r.end_date ?? ""}
                    onChange={(e) =>
                      setRows((rs) => {
                        const c = [...rs];
                        c[i] = { ...c[i], end_date: e.target.value };
                        return c;
                      })
                    }
                  />
                </td>
                <td className="p-1 text-center">
                  <input
                    type="checkbox"
                    checked={!!r.is_active}
                    onChange={(e) =>
                      setRows((rs) => {
                        const c = [...rs];
                        c[i] = { ...c[i], is_active: e.target.checked };
                        return c;
                      })
                    }
                  />
                </td>
                <td className="p-1">
                  <div className="flex gap-2">
                    <button
                      onClick={() => save(i)}
                      className="px-2 py-1 border rounded text-xs hover:bg-neutral-900"
                      disabled={busy}
                    >
                      Save
                    </button>
                    <button
                      onClick={() => del(i)}
                      className="px-2 py-1 border rounded text-xs hover:bg-neutral-900"
                      disabled={busy}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="p-3 text-neutral-400" colSpan={11}>
                  No employees yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
