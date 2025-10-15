import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { effectiveTenantId } from "@/lib/effective-tenant";

type InRow = {
  date?: string;               // e.g. "2025-10-01", "10/1/2025", etc.
  category?: string | null;
  description?: string | null;
  amount?: number | string | null;
};

type ExpenseInsert = {
  tenant_id: string;
  occurred_at: string;         // ISO date YYYY-MM-DD
  category: string;
  description: string | null;
  amount_usd: number;
};

function toISODate(input?: string): string {
  if (!input) return "";
  // Allow YYYY-MM-DD or any parsable date string (UTC normalize)
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
  const d = new Date(input);
  if (isNaN(+d)) return "";
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toAmount(n: unknown): number {
  if (typeof n === "number") return isFinite(n) ? n : 0;
  if (typeof n === "string") {
    const parsed = Number(n.replace(/[^0-9.-]/g, ""));
    return isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export async function POST(req: NextRequest) {
  const supabase = await createServerClient();

  // NEW: helper takes no args
  const { tenantId, useDemo } = await effectiveTenantId();

  if (!tenantId) {
    return NextResponse.json({ error: "No tenant." }, { status: 401 });
  }
  if (useDemo) {
    return NextResponse.json(
      { error: "Demo tenant is read-only. Disable 'Use demo data' to import." },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const rows = Array.isArray((body as any)?.rows) ? ((body as any).rows as InRow[]) : [];
  if (!rows.length) {
    return NextResponse.json({ error: "No rows provided." }, { status: 400 });
  }

  // Map and validate rows -> DB payload (strongly typed)
  const payload: ExpenseInsert[] = rows
    .map((r) => {
      const occurred_at = toISODate(r.date);
      const category = (r.category ?? "").toString().trim() || "Misc";
      const amount_usd = toAmount(r.amount);
      const description =
        (r.description ?? "") === "" ? null : String(r.description ?? "").trim();

      if (!occurred_at) return null;
      if (!isFinite(amount_usd)) return null;

      return {
        tenant_id: tenantId,
        occurred_at,
        category,
        description,
        amount_usd,
      } as ExpenseInsert;
    })
    .filter((x): x is ExpenseInsert => x !== null);

  if (!payload.length) {
    return NextResponse.json({ error: "No valid rows after parsing." }, { status: 400 });
  }

  const { error } = await supabase.from("expenses").insert(payload);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, inserted: payload.length });
}
