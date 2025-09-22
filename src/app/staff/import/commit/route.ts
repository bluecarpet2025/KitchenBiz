import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getEffectiveTenant } from "@/lib/effective-tenant";

// simple CSV parser (no external deps)
function csvToRows(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  return lines.map((line) => {
    // naive split that handles basic quoted values
    const out: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQ = !inQ;
        }
      } else if (ch === "," && !inQ) {
        out.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out.map((s) => s.trim());
  });
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: au } = await supabase.auth.getUser();
    if (!au.user) return NextResponse.redirect(new URL("/login", req.url));

    const tenantId = await getEffectiveTenant(supabase);
    if (!tenantId) return NextResponse.redirect(new URL("/staff", req.url));

    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) throw new Error("Missing file.");

    const text = await file.text();
    const rows = csvToRows(text);
    if (rows.length < 2) throw new Error("CSV needs a header and at least 1 row.");

    const header = rows[0].map((h) => h.toLowerCase());
    const dataRows = rows.slice(1);

    const idx = (name: string) => header.indexOf(name);

    const payload = dataRows
      .filter((r) => r.some((c) => c && c.length))
      .map((r) => {
        const pay = r[idx("pay_rate_usd")];
        return {
          tenant_id: tenantId,
          first_name: r[idx("first_name")] || "",
          last_name: r[idx("last_name")] || "",
          email: r[idx("email")] || null,
          phone: r[idx("phone")] || null,
          role: r[idx("role")] || null,
          pay_type: r[idx("pay_type")] || "hourly",
          pay_rate_usd: pay ? Number(pay) : 0,
          hire_date: r[idx("hire_date")] || null,
          end_date: r[idx("end_date")] || null,
          is_active:
            (r[idx("is_active")] || "").toLowerCase() === "true" ? true : true,
          notes: r[idx("notes")] || null,
        };
      });

    if (payload.length === 0) {
      return NextResponse.redirect(new URL("/staff?msg=No+rows", req.url));
    }

    const { error } = await supabase.from("employees").insert(payload);
    if (error) throw error;

    return NextResponse.redirect(new URL("/staff?msg=Import+complete", req.url));
  } catch (e: any) {
    const msg = encodeURIComponent(e.message ?? String(e));
    return NextResponse.redirect(new URL(`/staff?error=${msg}`, req.url));
  }
}
