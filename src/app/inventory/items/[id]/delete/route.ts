// src/app/inventory/items/[id]/delete/route.ts
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export const runtime = "edge";

function extractItemIdFromUrl(urlStr: string): string | null {
  const u = new URL(urlStr);
  // e.g. /inventory/items/<id>/delete
  const parts = u.pathname.split("/").filter(Boolean);
  const idx = parts.findIndex((p) => p === "items");
  if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
  return null;
}

async function deleteItem(itemId: string) {
  const supabase = await createServerClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr) {
    return NextResponse.json({ error: userErr.message }, { status: 500 });
  }
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Prefer soft-delete if column exists; fall back to hard delete.
  const nowIso = new Date().toISOString();

  const { error: softErr } = await supabase
    .from("inventory_items")
    .update({ archived_at: nowIso })
    .eq("id", itemId);

  if (softErr) {
    if (softErr.code === "42703") {
      const { error: hardErr } = await supabase
        .from("inventory_items")
        .delete()
        .eq("id", itemId);
      if (hardErr) {
        return NextResponse.json({ error: hardErr.message }, { status: 400 });
      }
    } else {
      return NextResponse.json({ error: softErr.message }, { status: 400 });
    }
  }

  try {
    revalidatePath("/inventory");
    revalidatePath("/inventory/manage");
  } catch {
    // ignore in edge if unavailable
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const itemId = extractItemIdFromUrl(req.url);
  if (!itemId) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }
  return deleteItem(itemId);
}

// Keep POST for backward-compat callers; same logic as DELETE
export async function POST(req: Request) {
  const itemId = extractItemIdFromUrl(req.url);
  if (!itemId) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }
  return deleteItem(itemId);
}
