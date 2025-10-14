// src/app/expenses/import/commit/route.ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { effectiveTenantId } from "@/lib/effective-tenant";

type IncomingRow = {
  date?: string | null;
  category?: string | null;
  description?: string | null;
  amount?: number | string | null;
} | null;

type ExpenseInsert = {
  tenant_id: string;
  occurred_at: string;           // YYYY-MM-DD
  category: string;
  description: string | null;
  amount_usd: number;
};

/* Normalize many date shapes into YYYY-MM-DD (UTC) */
function toISODate(input?: string | null): string | null {
  if (!input) return null;
  const trimmed = String(input).trim();
  if (!trimmed) return null;
  // Accept YYYY-MM-DD, M/D/YYYY, etc.
  const d = new Date(trimmed);
  if (isNaN(+d)) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function num(v: unknown): number {
  const n = typeof v === "string" ? Number(v.replace(/[$, ]/g, "")) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const { tenantId, useDemo } = await effectiveTenantId(supabase);

  if (!tenantId) {
    return NextResponse.json({ error: "No tenant." }, { status: 401 });
  }
  if (useDemo) {
    // read-only demo tenant — do not allow writes
    return NextResponse.json({ error: "Demo mode: imports are disabled." }, { status: 403 });
  }

  // Expect JSON: { rows: IncomingRow[] }
  const body = (await req.json()) as { rows?: IncomingRow[] } | null;
  const rows = body?.rows ?? [];

  // Map to DB rows, dropping null/invalid entries
  const payload: ExpenseInsert[] = rows
    .filter((r): r is NonNullable<IncomingRow> => !!r)
    .map((r) => {
      const occurred_at = toISODate(r.date) ?? "";
      const category = (r.category ?? "").toString().trim();
      const description = (r.description ?? null) as string | null;
      const amount_usd = num(r.amount);

      return {
        tenant_id: tenantId,      // ← string, not object
        occurred_at,
        category,
        description,
        amount_usd,
      };
    })
    .filter((r) => r.occurred_at && r.category); // keep only valid rows

  if (payload.length === 0) {
    return NextResponse.json({ inserted: 0, skipped: rows.length }, { status: 200 });
  }

  const { error } = await supabase.from("expenses").insert(payload);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ inserted: payload.length, skipped: rows.length - payload.length });
}
