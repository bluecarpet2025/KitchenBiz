import { NextResponse, NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

/** very small CSV parser (handles quoted commas) good enough for our template */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      row.push(cur.trim());
      cur = "";
    } else if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (cur.length || row.length) {
        row.push(cur.trim());
        rows.push(row);
      }
      cur = "";
      row = [];
      // consume \r\n pairs
      if (ch === "\r" && text[i + 1] === "\n") i++;
    } else {
      cur += ch;
    }
  }
  if (cur.length || row.length) {
    row.push(cur.trim());
    rows.push(row);
  }
  return rows.filter(r => r.some(c => c !== ""));
}

function cleanMoney(s: string): number {
  const t = s.replace(/[\$,]/g, "").replace(/\((.*)\)/, "-$1").trim();
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

function toISODate(d: string): string | null {
  // accept yyyy-mm-dd or mm/dd/yyyy
  const s = d.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const mm = m[1].padStart(2, "0");
    const dd = m[2].padStart(2, "0");
    return `${m[3]}-${mm}-${dd}`;
  }
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: u } = await supabase.auth.getUser();
    const user = u.user;
    if (!user) {
      return NextResponse.redirect(new URL("/login?redirect=/expenses", req.url));
    }

    const { data: prof, error: profErr } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", user.id)
      .maybeSingle();
    if (profErr || !prof?.tenant_id) {
      return NextResponse.redirect(
        new URL("/expenses?flash=Missing%20tenant", req.url)
      );
    }
    const tenantId = prof.tenant_id as string;

    const form = await req.formData();
    const file = form.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.redirect(
        new URL("/expenses?flash=No%20file%20uploaded", req.url)
      );
    }

    const text = await file.text();
    const rows = parseCsv(text);
    if (!rows.length) {
      return NextResponse.redirect(
        new URL("/expenses?flash=Empty%20CSV", req.url)
      );
    }

    // header validation
    const header = rows[0].map(h => h.toLowerCase());
    const wanted = ["date", "category", "description", "amount"];
    const missing = wanted.filter(w => !header.includes(w));
    if (missing.length) {
      return NextResponse.redirect(
        new URL(
          `/expenses?flash=Bad%20header:%20missing%20${encodeURIComponent(
            missing.join(", ")
          )}`,
          req.url
        )
      );
    }

    const idx = {
      date: header.indexOf("date"),
      category: header.indexOf("category"),
      description: header.indexOf("description"),
      amount: header.indexOf("amount"),
    };

    // map body rows
    const payload: any[] = [];
    let bad = 0;
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.length === 0) continue;
      const iso = toISODate(r[idx.date] ?? "");
      const amt = cleanMoney(r[idx.amount] ?? "");
      const category = (r[idx.category] ?? "").slice(0, 120);
      const description = (r[idx.description] ?? "").slice(0, 500);

      if (!iso || !category || !Number.isFinite(amt)) {
        bad++;
        continue;
      }
      payload.push({
        tenant_id: tenantId,
        occurred_at: iso,
        category,
        description,
        amount_usd: amt,
      });
    }

    if (payload.length) {
      const { error: insErr } = await supabase
        .from("expenses")
        .insert(payload);
      if (insErr) {
        console.error("expenses insert error:", insErr);
        return NextResponse.redirect(
          new URL("/expenses?flash=Insert%20failed", req.url)
        );
      }
    }

    const ok = payload.length;
    const msg =
      ok > 0
        ? `Imported%20${ok}%20rows${bad ? `%2C%20skipped%20${bad}` : ""}`
        : "No%20valid%20rows%20found";
    return NextResponse.redirect(new URL(`/expenses?flash=${msg}`, req.url));
  } catch (e: any) {
    console.error("expenses import fatal:", e);
    return NextResponse.redirect(
      new URL("/expenses?flash=Unexpected%20error", req.url)
    );
  }
}
