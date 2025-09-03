// src/app/inventory/items/[id]/delete/route.ts
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export const runtime = "edge";

async function deleteItem(itemId: string) {
  const supabase = await createServerClient();

  // Ensure user is signed in (RLS will also protect the delete)
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

  // Prefer a soft delete if the table has archived_at; otherwise hard delete.
  // If archived_at doesn't exist, PostgREST returns code 42703.
  const nowIso = new Date().toISOString();

  const { error: softErr } = await supabase
    .from("inventory_items")
    .update({ archived_at: nowIso })
    .eq("id", itemId);

  if (softErr) {
    // Column doesn't exist -> fall back to hard delete
    if (softErr.code === "42703") {
      const { error: hardErr } = await supabase
        .from("inventory_items")
        .delete()
        .eq("id", itemId);

      if (hardErr) {
        return NextResponse.json({ error: hardErr.message }, { status: 400 });
      }
    } else {
      // Some other failure trying to soft delete
      return NextResponse.json({ error: softErr.message }, { status: 400 });
    }
  }

  // Revalidate common pages that list items
  try {
    revalidatePath("/inventory");
    revalidatePath("/inventory/manage");
  } catch {
    // Best-effort revalidation; ignore in edge if not supported
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const itemId = params.id;
  if (!itemId) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }
  return deleteItem(itemId);
}

// Some clients might still call POST—support it for backward compatibility.
export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const itemId = params.id;
  if (!itemId) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }
  return deleteItem(itemId);
}
