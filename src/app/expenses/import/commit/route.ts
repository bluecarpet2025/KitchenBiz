import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getEffectiveTenant } from "@/lib/effective-tenant";

type CsvRow = {
  date?: string;
  category?: string;
  description?: string;
  amount?: string;
};

function parseCsv(text: string): CsvRow[] {
  // tolerate BOM
  const t = text.replace(/^\uFEFF/, "");
  const lines = t.split(/\r?\n/).filter((l) => l.trim().length > 0);

  if (lines.length === 0) return [];
  const headers = lines[0]
    .split(",")
    .map((h) => h.trim().toLowerCase().replace(/(^"|"$)/g, ""));

  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i];
    // simple CSV split; good enough for our template (no embedded commas in quoted fields)
    const parts = raw.split(",").map((p) => p.trim().replace(/(^"|"$)/g, ""));
    const row: any = {};
    headers.forEach((h, idx) => (row[h] = parts[idx]));
    rows.push(row);
  }
  return rows;
}

function toISODate(d: string | undefined): string | null {
  if (!d) return null;
  // accept YYYY-MM-DD or M/D/YYYY style
  // try native Date parse
  const maybe = new Date(d);
  if (!isNaN(maybe.getTime())) {
    return new Date(Date.UTC(maybe.getFullYear(), maybe.getMonth(), maybe.getDate()))
      .toISOString();
  }
  // manual M/D/YYYY
  const mdy = d.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (mdy) {
    const m = Number(mdy[1]) - 1;
    const day = Number(mdy[2]);
    let y = Number(mdy[3]);
    if (y < 100) y += 2000;
    return new Date(Date.UTC(y, m, day)).toISOString();
  }
  return null;
}

export async function POST(req: Request) {
  try {
    const supabase = await createServerClient();
    const tenantId = await getEffectiveTenant(supabase);
    if (!tenantId) {
      return NextResponse.json(
        { ok: false, message: "Sign in required / tenant missing." },
        { status: 401 }
      );
    }

    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) {
      return NextResponse.json(
        { ok: false, message: "No file uploaded." },
        { status: 400 }
      );
    }

    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length === 0) {
      return NextResponse.json(
        { ok: false, message: "CSV appears empty." },
        { status: 400 }
      );
    }

    // Map to DB rows
    const payload = rows
      .map((r) => {
        const occurred_at = toISODate(r.date);
        const category = (r.category ?? "").trim();
        const description = (r.description ?? "").trim();
        const amount = parseFloat(String(r.amount ?? "").replace(/[$,]/g, ""));

        if (!occurred_at || !category || isNaN(amount)) {
          return null;
        }
        return {
          tenant_id: tenantId,
          occurred_at,
          category,
          description: description || null,
          amount_usd: amount,
        };
      })
      .filter(Boolean) as Array<{
        tenant_id: string;
        occurred_at: string;
        category: string;
        description: string | null;
        amount_usd: number;
      }>;

    if (payload.length === 0) {
      return NextResponse.json(
        { ok: false, message: "No valid rows found in CSV." },
        { status: 400 }
      );
    }

    const { error } = await supabase.from("expenses").insert(payload);
    if (error) {
      console.error(error);
      return NextResponse.json(
        { ok: false, message: "Insert failed." },
        { status: 500 }
      );
    }

    // back to listing
    return NextResponse.redirect(new URL("/expenses", req.url), { status: 303 });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { ok: false, message: e?.message ?? "Upload failed." },
      { status: 500 }
    );
  }
}
