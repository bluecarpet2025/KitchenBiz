// src/app/api/staff/schedule/route.ts
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getEffectiveTenant } from "@/lib/effective-tenant";

export async function POST(req: Request) {
  const body = await req.json();
  const action: "create" | "delete" = body.action;

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantId = await getEffectiveTenant();
  if (!tenantId) {
    return NextResponse.json(
      { error: "Missing tenant" },
      { status: 400 }
    );
  }

  if (action === "create") {
    const { employeeId, shiftDate, hours, notes } = body;
    const { data, error } = await supabase
      .from("staff_schedules")
      .insert({
        tenant_id: tenantId,
        employee_id: employeeId,
        shift_date: shiftDate,
        hours,
        notes,
      })
      .select("id, employee_id, shift_date, hours, notes")
      .single();

    if (error) {
      console.error("create schedule error", error);
      return NextResponse.json(
        { error: "Failed to create shift" },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  }

  if (action === "delete") {
    const { id } = body;
    const { error } = await supabase
      .from("staff_schedules")
      .delete()
      .eq("id", id)
      .eq("tenant_id", tenantId);

    if (error) {
      console.error("delete schedule error", error);
      return NextResponse.json(
        { error: "Failed to delete shift" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
