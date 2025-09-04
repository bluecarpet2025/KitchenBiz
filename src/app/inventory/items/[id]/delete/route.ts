import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export const runtime = "edge";

async function handleDeleteAction(id: string) {
  if (!id || typeof id !== "string") {
    return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
  }
  const supabase = await createServerClient();

  // auth
  const { data: u, error: userErr } = await supabase.auth.getUser();
  if (userErr) return NextResponse.json({ ok: false, error: userErr.message }, { status: 500 });
  const user = u.user ?? null;
  if (!user) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });

  // tenant
  const { data: prof, error: profErr } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .maybeSingle();
  if (profErr) return NextResponse.json({ ok: false, error: profErr.message }, { status: 400 });

  const tenantId = prof?.tenant_id ?? null;
  if (!tenantId) return NextResponse.json({ ok: false, error: "no_tenant" }, { status: 400 });

  // soft-delete
  const { error } = await supabase
    .from("inventory_items")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", tenantId);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  try {
    revalidatePath("/inventory");
    revalidatePath("/inventory/manage");
  } catch {}

  return NextResponse.json({ ok: true }, { status: 200 });
}

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return handleDeleteAction(id);
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return handleDeleteAction(id);
}

// 🚫 Safety: never delete on GET (block crawlers/prefetchers)
export async function GET() {
  return NextResponse.json({ ok: false, error: "method_not_allowed" }, { status: 405 });
}
