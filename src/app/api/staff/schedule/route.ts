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
    const {
      employeeId,
      shiftDate,
      startTime, // "HH:MM"
      endTime,   // "HH:MM"
      notes,
    } = body as {
      employeeId: string;
      shiftDate: string;
      startTime: string;
      endTime: string;
      notes: string | null;
    };

    // Compute hours from start/end (same-day shift)
    const hours = computeHours(startTime, endTime);

    const { data, error } = await supabase
      .from("staff_schedules")
      .insert({
        tenant_id: tenantId,
        employee_id: employeeId,
        shift_date: shiftDate,
        start_time: startTime,
        end_time: endTime,
        hours,
        notes,
      })
      .select("id, employee_id, shift_date, start_time, end_time, hours, notes")
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
    const { id } = body as { id: string };

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

function computeHours(start: string, end: string): number {
  // inputs like "07:00" or "07:00:00"
  const [sh, sm] = start.split(":").map((n) => Number(n) || 0);
  const [eh, em] = end.split(":").map((n) => Number(n) || 0);

  const startMinutes = sh * 60 + sm;
  const endMinutes = eh * 60 + em;

  // same-day only; if end <= start, treat as 0
  if (endMinutes <= startMinutes) return 0;

  const diffMinutes = endMinutes - startMinutes;
  return Math.round((diffMinutes / 60) * 100) / 100; // 2 decimals
}
