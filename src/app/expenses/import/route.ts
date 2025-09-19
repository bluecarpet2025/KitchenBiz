import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getEffectiveTenant } from "@/lib/effective-tenant";

export const dynamic = "force-dynamic";

function parseCsv(text: string): Record<string, string>[] {
  // tiny CSV parser with quotes support
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => { row.push(field); field = ""; };
  const pushRow = () => { rows.push(row); row = []; };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") pushField();
      else if (c === "\n") { pushField(); pushRow(); }
      else if (c === "\r") { /* ignore */ }
      else field += c;
    }
  }
  // last field/row
  pushField();
  if (row.length > 1 || row[0] !== "") pushRow();

  if (rows.length === 0) return [];
  const headers = rows.shift()!.map((h) => h.trim().toLowerCase());
  return rows
    .filter((r) => r.some((c) => c.trim() !== ""))
    .map((r) => {
      const o: Record<string, string> = {};
      for (let i = 0; i < headers.length; i++) o[headers[i]] = (r[i] ?? "").trim();
      return o;
    });
}

function toISODate(v?: string) {
  if (!v) return null;
  // accept yyyy-mm-dd or mm/dd/yyyy
  const t = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return new Date(t + "T00:00:00Z").toISOString();
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const mm = Number(m[1]) - 1;
    const dd = Number(m[2]);
    const yyyy = Number(m[3]);
    return new Date(Date.UTC(yyyy, mm, dd)).toISOString();
  }
  const d = new Date(t);
  if (!isNaN(+d)) return d.toISOString();
  return null;
}

export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const tenantId = await getEffectiveTenant(supabase);
  if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 401 });

  const form = await req.formData();
  const f = form.get("file");
  if (!(f instanceof Blob)) {
    return NextResponse.json({ error: "Missing CSV file" }, { status: 400 });
  }
  const text = await f.text();
  const rows = parseCsv(text);

  const toInsert: any[] = [];
  for (const r of rows) {
    const occurred_at =
      toISODate(r["date"]) ??
      toISODate(r["occurred_at"]);
    const amountRaw = (r["amount"] ?? "").replace(/[^0-9.\-]/g, "");
    const amount = Number(amountRaw || "0");
    if (!occurred_at || !(amount > 0)) continue;

    toInsert.push({
      tenant_id: tenantId,
      occurred_at,
      category: (r["category"] ?? null) || null,
      description: (r["description"] ?? r["note"] ?? r["memo"] ?? null) || null,
      amount,
      source: "import",
    });
  }

  if (toInsert.length) {
    const { error } = await supabase.from("expenses").insert(toInsert);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.redirect(new URL("/expenses", req.url));
}
