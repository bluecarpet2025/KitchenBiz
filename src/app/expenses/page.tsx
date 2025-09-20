/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { getEffectiveTenant } from "@/lib/effective-tenant";
import { fmtUSD } from "@/lib/costing";

export const dynamic = "force-dynamic";

type ExpenseRow = {
  id: string;
  tenant_id: string;
  date: string;            // ISO date
  category: string | null;
  description: string | null;
  amount_usd: number;
};

type Tot = { key: string; label: string; entries: number; amount: number };

function pad(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

function ymd(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function ym(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
function year(d: Date) {
  return `${d.getFullYear()}`;
}
function quarterKey(d: Date) {
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `${d.getFullYear()}-Q${q}`;
}
function isoWeekKey(d: Date) {
  // Minimal ISO week: Thursday-based week number
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  // Set to nearest Thursday (current date + 4 - current day number)
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((+date - +yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${pad(weekNo)}`;
}

function agg(rows: ExpenseRow[], keyFn: (d: Date) => string, labelFn: (k: string) => string): Tot[] {
  const m = new Map<string, { entries: number; amount: number }>();
  for (const r of rows) {
    const d = r.date ? new Date(r.date) : null;
    if (!d) continue;
    const key = keyFn(d);
    const cur = m.get(key) ?? { entries: 0, amount: 0 };
    cur.entries += 1;
    cur.amount += Number(r.amount_usd || 0);
    m.set(key, cur);
  }
  const out: Tot[] = [];
  for (const [key, v] of m.entries()) out.push({ key, label: labelFn(key), entries: v.entries, amount: v.amount });
  // Desc by key where key formats are sortable (they are)
  out.sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0));
  return out;
}

export default async function ExpensesPage() {
  const supabase = await createServerClient();

  // Auth (soft) — show page even if signed out, but encourage login
  const { data: au } = await supabase.auth.getUser();
  const user = au.user ?? null;

  const tenantId = await getEffectiveTenant(supabase);
  // If no tenant (signed out or profile missing), show empty shell
  let rows: ExpenseRow[] = [];
  if (tenantId) {
    const { data } = await supabase
      .from("expenses")
      .select("id, tenant_id, date, category, description, amount_usd")
      .eq("tenant_id", tenantId)
      .order("date", { ascending: true })
      .limit(5000);
    rows = (data ?? []) as ExpenseRow[];
  }

  // Aggregations
  const byMonth = agg(rows, (d) => ym(d), (k) => k);
  const byWeek = agg(rows, (d) => isoWeekKey(d), (k) => k);
  const byDay = agg(rows, (d) => ymd(d), (k) => k);
  const byQuarter = agg(rows, (d) => quarterKey(d), (k) => k);
  const byYear = agg(rows, (d) => year(d), (k) => k);

  // Top categories (YTD)
  const now = new Date();
  const curYear = now.getFullYear();
  const catMap = new Map<string, number>();
  for (const r of rows) {
    const d = r.date ? new Date(r.date) : null;
    if (!d || d.getFullYear() !== curYear) continue;
    const cat = (r.category ?? "Uncategorized").trim() || "Uncategorized";
    catMap.set(cat, (catMap.get(cat) ?? 0) + Number(r.amount_usd || 0));
  }
  const topCats = Array.from(catMap.entries())
    .map(([k, v]) => ({ category: k, amount: v }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 12);

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Expenses</h1>
        <div className="flex gap-2">
          <Link
            href="/expenses/manage"
            className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
          >
            Manage
          </Link>
          <Link
            href="/expenses/import"
            className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
          >
            Import CSV
          </Link>
          <Link
            href="/expenses/template"
            className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
          >
            Download template
          </Link>
        </div>
      </div>

      {/* Month totals */}
      <Section title="Month totals">
        <Table header={["Month", "Entries", "Amount"]}>
          {byMonth.length === 0 ? (
            <NoData />
          ) : (
            byMonth.map((t) => (
              <tr key={t.key} className="border-t">
                <td className="p-2">{t.label}</td>
                <td className="p-2 tabular-nums">{t.entries}</td>
                <td className="p-2 tabular-nums">{fmtUSD(t.amount)}</td>
              </tr>
            ))
          )}
        </Table>
      </Section>

      {/* Week totals */}
      <Section title="Week totals">
        <Table header={["Week", "Entries", "Amount"]}>
          {byWeek.length === 0 ? (
            <NoData />
          ) : (
            byWeek.map((t) => (
              <tr key={t.key} className="border-t">
                <td className="p-2">{t.label}</td>
                <td className="p-2 tabular-nums">{t.entries}</td>
                <td className="p-2 tabular-nums">{fmtUSD(t.amount)}</td>
              </tr>
            ))
          )}
        </Table>
      </Section>

      {/* Day totals */}
      <Section title="Day totals">
        <Table header={["Day", "Entries", "Amount"]}>
          {byDay.length === 0 ? (
            <NoData />
          ) : (
            byDay.map((t) => (
              <tr key={t.key} className="border-t">
                <td className="p-2">{t.label}</td>
                <td className="p-2 tabular-nums">{t.entries}</td>
                <td className="p-2 tabular-nums">{fmtUSD(t.amount)}</td>
              </tr>
            ))
          )}
        </Table>
      </Section>

      {/* Quarter totals */}
      <Section title="Quarter totals">
        <Table header={["Quarter", "Entries", "Amount"]}>
          {byQuarter.length === 0 ? (
            <NoData />
          ) : (
            byQuarter.map((t) => (
              <tr key={t.key} className="border-t">
                <td className="p-2">{t.label}</td>
                <td className="p-2 tabular-nums">{t.entries}</td>
                <td className="p-2 tabular-nums">{fmtUSD(t.amount)}</td>
              </tr>
            ))
          )}
        </Table>
      </Section>

      {/* Year totals */}
      <Section title="Year totals">
        <Table header={["Year", "Entries", "Amount"]}>
          {byYear.length === 0 ? (
            <NoData />
          ) : (
            byYear.map((t) => (
              <tr key={t.key} className="border-t">
                <td className="p-2">{t.label}</td>
                <td className="p-2 tabular-nums">{t.entries}</td>
                <td className="p-2 tabular-nums">{fmtUSD(t.amount)}</td>
              </tr>
            ))
          )}
        </Table>
      </Section>

      {/* Top categories (YTD) */}
      <div className="border rounded-lg overflow-hidden">
        <div className="px-3 py-2 text-sm bg-neutral-900/60">Top categories (YTD)</div>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="p-2 text-left">Category</th>
              <th className="p-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {topCats.length === 0 ? (
              <NoData colSpan={2} />
            ) : (
              topCats.map((c) => (
                <tr key={c.category} className="border-t">
                  <td className="p-2">{c.category}</td>
                  <td className="p-2 text-right tabular-nums">{fmtUSD(c.amount)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!user && (
        <p className="text-sm opacity-70">
          Tip: sign in to add, import, and manage expenses.
        </p>
      )}
    </main>
  );
}

/* ---------- small presentational helpers ---------- */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="px-3 py-2 text-sm bg-neutral-900/60">{title}</div>
      {children}
    </div>
  );
}

function Table({
  header,
  children,
}: {
  header: string[];
  children: React.ReactNode;
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr>
          {header.map((h) => (
            <th key={h} className={`p-2 ${h === "Amount" ? "text-right" : h === "Entries" ? "text-right" : "text-left"}`}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

function NoData({ colSpan = 3 }: { colSpan?: number }) {
  return (
    <tr>
      <td className="p-3 text-neutral-400" colSpan={colSpan}>
        No data.
      </td>
    </tr>
  );
}
