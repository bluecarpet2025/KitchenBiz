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
      startTime,
      endTime,
      notes,
    } = body as {
      employeeId: string;
      shiftDate: string;
      startTime: string;
      endTime: string;
      notes: string | null;
    };

    const hours = computeHours(startTime, endTime);

    // Look up pay info for this employee
    const { data: emp, error: empError } = await supabase
      .from("employees")
      .select("pay_type, pay_rate_usd")
      .eq("id", employeeId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (empError) {
      console.error("employee lookup error", empError);
    }

    let hourlyRate = Number(emp?.pay_rate_usd ?? 0);

    // If salary, approximate hourly for payroll purposes.
    if (emp?.pay_type === "salary" && hourlyRate > 0) {
      hourlyRate = hourlyRate / 2080; // 40h/week * 52 weeks
    }

    // Total cost for this shift
    const shiftPayUsd = hours * hourlyRate;

    // Insert into labor_shifts so dashboards & exports see payroll
    const occurredAtIso = new Date(`${shiftDate}T00:00:00Z`).toISOString();

    const { data: labor, error: laborError } = await supabase
      .from("labor_shifts")
      .insert({
        tenant_id: tenantId,
        occurred_at: occurredAtIso,
        hours,
        wage_usd: shiftPayUsd,
      })
      .select("id")
      .single();

    if (laborError) {
      console.error("create labor_shift error", laborError);
      // Continue anyway so schedule is not blocked; this shift just won't
      // show in payroll until we fix the data.
    }

    const laborShiftId = labor?.id ?? null;

    // Insert schedule row
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
        labor_shift_id: laborShiftId,
      })
      .select(
        "id, employee_id, shift_date, start_time, end_time, hours, notes"
      )
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

    // First fetch the linked labor_shift_id (if any)
    const { data: schedule, error: schedError } = await supabase
      .from("staff_schedules")
      .select("labor_shift_id")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (schedError) {
      console.error("fetch schedule before delete error", schedError);
    }

    const laborShiftId = schedule?.labor_shift_id as string | null;

    // Delete schedule row
    const { error: delSchedError } = await supabase
      .from("staff_schedules")
      .delete()
      .eq("id", id)
      .eq("tenant_id", tenantId);

    if (delSchedError) {
      console.error("delete schedule error", delSchedError);
      return NextResponse.json(
        { error: "Failed to delete shift" },
        { status: 500 }
      );
    }

    // If linked, delete the labor_shifts row too
    if (laborShiftId) {
      const { error: delLaborError } = await supabase
        .from("labor_shifts")
        .delete()
        .eq("id", laborShiftId)
        .eq("tenant_id", tenantId);

      if (delLaborError) {
        console.error("delete labor_shift error", delLaborError);
      }
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
