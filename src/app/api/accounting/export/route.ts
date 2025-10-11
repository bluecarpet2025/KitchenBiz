import "server-only";
import { NextRequest } from "next/server";
import JSZip from "jszip";
import { createServerClient } from "@/lib/supabase/server";

/** Force Node runtime so we can return a Node Buffer cleanly. */
export const runtime = "nodejs";

/* ----------------------------- small helpers ----------------------------- */
const pad2 = (n: number) => String(n).padStart(2, "0");
const csvEsc = (v: any) =>
  v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
function toCSV(rows: any[]): string {
  if (!rows?.length) return "";
  const cols = Object.keys(rows[0]);
  return [cols.join(","), ...rows.map((r) => cols.map((c) => csvEsc(r[c])).join(","))].join("\n");
}
function monthAdd(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  d.setUTCMonth(d.getUTCMonth() + delta);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}
const monthStart = (ym: string) => `${ym}-01T00:00:00Z`;

/* --------------------------------- GET --------------------------------- */
export async function GET(req: NextRequest) {
  const supabase = await createServerClient();

  // auth / tenant
  const { data: u } = await supabase.auth.getUser();
  const uid = u?.user?.id;
  if (!uid) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

  const { data: prof } = await supabase.from("profiles").select("tenant_id").eq("id", uid).maybeSingle();
  const tenantId = prof?.tenant_id as string | undefined;
  if (!tenantId) return new Response(JSON.stringify({ error: "No tenant" }), { status: 400 });

  // params
  const url = new URL(req.url);
  const year = url.searchParams.get("year");
  let start = url.searchParams.get("start"); // YYYY-MM-DD
  let end = url.searchParams.get("end");     // YYYY-MM-DD (exclusive)

  if ((!start || !end) && year) {
    const y = Number(year);
    start = `${y}-01-01`;
    end = `${y + 1}-01-01`;
  }
  if (!start || !end) {
    // default last 12 months
    const now = new Date();
    const endD = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const startD = new Date(Date.UTC(endD.getUTCFullYear(), endD.getUTCMonth() - 12, 1));
    start = `${startD.getUTCFullYear()}-${pad2(startD.getUTCMonth() + 1)}-01`;
    end = `${endD.getUTCFullYear()}-${pad2(endD.getUTCMonth() + 1)}-01`;
  }

  const startTs = `${start}T00:00:00Z`;
  const endTs = `${end}T00:00:00Z`;

  /* ----------------------------- pull data ----------------------------- */
  const { data: expenses } = await supabase
    .from("expenses")
    .select("id, occurred_at, category, description, amount_usd, source, created_at")
    .eq("tenant_id", tenantId)
    .gte("occurred_at", startTs)
    .lt("occurred_at", endTs)
    .order("occurred_at", { ascending: true });

  const { data: orders } = await supabase
    .from("sales_orders")
    .select("id, occurred_at, source, channel, customer, note, created_at")
    .eq("tenant_id", tenantId)
    .gte("occurred_at", startTs)
    .lt("occurred_at", endTs)
    .order("occurred_at", { ascending: true });

  // order lines (chunked)
  const orderIds = (orders ?? []).map((o: any) => o.id);
  let lines: any[] = [];
  const CHUNK = 500;
  for (let i = 0; i < orderIds.length; i += CHUNK) {
    const slice = orderIds.slice(i, i + CHUNK);
    const { data } = await supabase
      .from("sales_order_lines")
      .select("order_id, product_id, product_name, qty, unit_price, tax, discount, total")
      .in("order_id", slice);
    lines = lines.concat(data ?? []);
  }

  // sales summary by day
  const salesSummary = (() => {
    const bucket = new Map<string, number>();
    (orders ?? []).forEach((o: any) => {
      const dt = new Date(o.occurred_at ?? o.created_at);
      const k = `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
      const sum = (lines.filter((l) => l.order_id === o.id) ?? []).reduce(
        (a, b) => a + (Number(b.total ?? 0) || Number(b.qty || 0) * Number(b.unit_price || 0)),
        0
      );
      bucket.set(k, (bucket.get(k) || 0) + sum);
    });
    return [...bucket.entries()]
      .map(([day, revenue]) => ({ day, revenue }))
      .sort((a, b) => (a.day < b.day ? -1 : 1));
  })();

  // income statement by month within range
  const months: string[] = [start!.slice(0, 7)];
  while (months[months.length - 1] < end!.slice(0, 7)) {
    months.push(monthAdd(months[months.length - 1], 1));
    if (months.length > 60) break;
  }
  months.pop();

  const incomeRows: any[] = [];
  for (const m of months) {
    const { data: s } = await supabase.from("v_sales_month_totals").select("revenue").eq("month", m).maybeSingle();
    const sales = Number((s as any)?.revenue ?? 0);

    const mStart = monthStart(m);
    const mEnd = monthStart(monthAdd(m, 1));
    const { data: expRows } = await supabase
      .from("expenses")
      .select("category, amount_usd")
      .eq("tenant_id", tenantId)
      .gte("occurred_at", mStart)
      .lt("occurred_at", mEnd);

    const bucket = new Map<string, number>();
    (expRows ?? []).forEach((r: any) => {
      const k = (r.category?.trim() || "Misc") as string;
      bucket.set(k, (bucket.get(k) || 0) + Number(r.amount_usd || 0));
    });
    const food = bucket.get("Food") || 0;
    const labor = bucket.get("Labor") || 0;
    const rent = bucket.get("Rent") || 0;
    const utilities = bucket.get("Utilities") || 0;
    const marketing = bucket.get("Marketing") || 0;
    const misc = bucket.get("Misc") || 0;
    const total_expenses = [...bucket.values()].reduce((a, b) => a + b, 0);
    const profit = sales - total_expenses;

    incomeRows.push({ month: m, sales, food, labor, rent, utilities, marketing, misc, total_expenses, profit });
  }

  const { data: vendors } = await supabase
    .from("vendors")
    .select("id, name, contact, created_at")
    .eq("tenant_id", tenantId);
  const { data: employees } = await supabase
    .from("employees")
    .select(
      "id, first_name, last_name, display_name, email, phone, role, pay_type, pay_rate_usd, hire_date, end_date, is_active, created_at"
    )
    .eq("tenant_id", tenantId);

  const { data: receipts } = await supabase
    .from("inventory_receipts")
    .select("id, item_id, qty_base, total_cost_usd, unit_cost_base, expires_on, note, purchased_at")
    .eq("tenant_id", tenantId)
    .gte("purchased_at", startTs)
    .lt("purchased_at", endTs)
    .order("purchased_at", { ascending: true });

  /* ----------------------------- build ZIP ----------------------------- */
  const label =
    start === `${new Date(start!).getUTCFullYear()}-01-01` &&
    end === `${new Date(start!).getUTCFullYear() + 1}-01-01`
      ? `${new Date(start!).getUTCFullYear()}`
      : `${start}_to_${end}`;

  const zip = new JSZip();
  zip.file(
    "README.txt",
    `KitchenBiz — Accountant Pack (${label})
This ZIP contains CSV exports suitable for bookkeeping and tax prep.

Files:
- income_statement_by_month.csv
- expenses_detail.csv
- sales_summary_by_day.csv
- sales_order_lines_detail.csv
- vendors.csv
- employees.csv
- inventory_receipts.csv

All amounts in USD. Dates are UTC.`
  );

  zip.file("income_statement_by_month.csv", toCSV(incomeRows));
  zip.file(
    "expenses_detail.csv",
    toCSV(
      (expenses ?? []).map((e: any) => ({
        id: e.id,
        occurred_at: e.occurred_at,
        category: e.category,
        description: e.description,
        amount_usd: e.amount_usd,
        source: e.source,
        created_at: e.created_at,
      }))
    )
  );
  zip.file("sales_summary_by_day.csv", toCSV(salesSummary));
  zip.file(
    "sales_order_lines_detail.csv",
    toCSV(
      (lines ?? []).map((l: any) => ({
        order_id: l.order_id,
        product_id: l.product_id,
        product_name: l.product_name,
        qty: l.qty,
        unit_price: l.unit_price,
        discount: l.discount,
        tax: l.tax,
        total: l.total ?? Number(l.qty || 0) * Number(l.unit_price || 0),
      }))
    )
  );
  zip.file(
    "vendors.csv",
    toCSV(
      (vendors ?? []).map((v: any) => ({
        id: v.id,
        name: v.name,
        contact: JSON.stringify(v.contact ?? {}),
        created_at: v.created_at,
      }))
    )
  );
  zip.file("employees.csv", toCSV(employees ?? []));
  zip.file(
    "inventory_receipts.csv",
    toCSV(
      (receipts ?? []).map((r: any) => ({
        id: r.id,
        item_id: r.item_id,
        qty_base: r.qty_base,
        unit_cost_base: r.unit_cost_base,
        total_cost_usd: r.total_cost_usd,
        purchased_at: r.purchased_at,
        expires_on: r.expires_on,
        note: r.note,
      }))
    )
  );

  // Generate zip as Uint8Array and return a **Node Buffer**
  const u8 = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  const buf = Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength); // Node Buffer

  const filename = `kitchenbiz_accountant_pack_${label}.zip`;
  return new Response(buf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
