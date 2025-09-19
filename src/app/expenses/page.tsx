import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { getEffectiveTenant } from "@/lib/effective-tenant";
import { fmtUSD } from "@/lib/costing";

export const dynamic = "force-dynamic";

type Tot = { label: string; count: number; amount: number };

function isoWeek(d: Date) {
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((tmp as any) - (yearStart as any)) / 86400000 + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}
function quarterLabel(d: Date) {
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `${d.getFullYear()}-Q${q}`;
}
function agg(rows: any[], key: (d: Date) => string): Tot[] {
  const map = new Map<string, Tot>();
  for (const r of rows ?? []) {
    const dt = r?.occurred_at ? new Date(r.occurred_at) : null;
    if (!dt) continue;
    const k = key(dt);
    const t = map.get(k) ?? { label: k, count: 0, amount: 0 };
    t.count += 1;
    t.amount += Number(r?.amount ?? 0);
    map.set(k, t);
  }
  return Array.from(map.values()).sort((a, b) => (a.label < b.label ? -1 : 1));
}

export default async function ExpensesPage() {
  const supabase = await createServerClient();
  const tenantId = await getEffectiveTenant(supabase);
  if (!tenantId) {
    return (
      <main className="max-w-7xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Expenses</h1>
        <p className="mt-2">Profile missing tenant.</p>
      </main>
    );
  }

  const { data: rows } = await supabase
    .from("expenses")
    .select("id, occurred_at, category, description, amount")
    .eq("tenant_id", tenantId)
    .order("occurred_at", { ascending: true });

  const byMonth = agg(rows ?? [], (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  const byWeek = agg(rows ?? [], (d) => isoWeek(d));
  const byDay = agg(rows ?? [], (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).toLocaleDateString());
  const byQuarter = agg(rows ?? [], (d) => quarterLabel(d));
  const byYear = agg(rows ?? [], (d) => String(d.getFullYear()));

  // YTD by category
  const now = new Date();
  const yStart = new Date(now.getFullYear(), 0, 1).getTime();
  const yEnd = new Date(now.getFullYear() + 1, 0, 1).getTime();
  const ytd = (rows ?? []).filter((r: any) => {
    const t = r?.occurred_at ? new Date(r.occurred_at).getTime() : NaN;
    return Number.isFinite(t) && t >= yStart && t < yEnd;
  });
  const cat = new Map<string, number>();
  for (const r of ytd) {
    const k = (r?.category ?? "Uncategorized").toString() || "Uncategorized";
    cat.set(k, (cat.get(k) ?? 0) + Number(r?.amount ?? 0));
  }
  const catTop = Array.from(cat.entries())
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 8);

  return (
    <main className="max-w-7xl mx-auto p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Expenses</h1>
        <div className="flex gap-2">
          <Link href="/expenses/manage" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
            Manage
          </Link>
          <Link href="/expenses/import" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
            Import CSV
          </Link>
          <Link href="/expenses/import/template" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
            Download template
          </Link>
        </div>
      </div>

      {[
        { title: "Month totals", rows: byMonth },
        { title: "Week totals", rows: byWeek },
        { title: "Day totals", rows: byDay },
        { title: "Quarter totals", rows: byQuarter },
        { title: "Year totals", rows: byYear },
      ].map((blk) => (
        <details key={blk.title} className="border rounded-lg">
          <summary className="cursor-pointer px-3 py-2 bg-neutral-900/50">{blk.title}</summary>
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="p-2 text-left">Period</th>
                <th className="p-2 text-right">Entries</th>
                <th className="p-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {blk.rows.map((t) => (
                <tr key={t.label} className="border-t">
                  <td className="p-2">{t.label}</td>
                  <td className="p-2 text-right">{t.count}</td>
                  <td className="p-2 text-right">{fmtUSD(t.amount)}</td>
                </tr>
              ))}
              {blk.rows.length === 0 && (
                <tr>
                  <td className="p-3 text-neutral-400" colSpan={3}>
                    No data.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </details>
      ))}

      <div className="border rounded-lg overflow-hidden">
        <div className="px-3 py-2 bg-neutral-900/50 font-medium">Top categories (YTD)</div>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="p-2 text-left">Category</th>
              <th className="p-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {catTop.map((r) => (
              <tr key={r.category} className="border-t">
                <td className="p-2">{r.category}</td>
                <td className="p-2 text-right">{fmtUSD(r.amount)}</td>
              </tr>
            ))}
            {catTop.length === 0 && (
              <tr>
                <td className="p-3 text-neutral-400" colSpan={2}>
                  No data.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
