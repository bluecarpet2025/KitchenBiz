"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Employee = {
  id: string;
  display_name: string | null;
  is_active: boolean | null;
};

type ScheduleRow = {
  id: string;
  employee_id: string;
  shift_date: string; // YYYY-MM-DD
  hours: number;
  notes: string | null;
};

type Props = {
  employees: Employee[];
  initialSchedules: ScheduleRow[];
};

type ViewMode = "week" | "month";

type CalendarDay = {
  date: Date;
  dateKey: string; // YYYY-MM-DD
  inCurrentMonth: boolean;
};

export default function StaffScheduleClient({
  employees,
  initialSchedules,
}: Props) {
  const router = useRouter();
  const [view, setView] = useState<ViewMode>("week");
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>(
    employees[0]?.id ?? ""
  );
  const [hours, setHours] = useState<string>("8");
  const [notes, setNotes] = useState<string>("");

  const [schedules, setSchedules] = useState<ScheduleRow[]>(initialSchedules);

  const days = useMemo(
    () => buildCalendarDays(currentDate, view),
    [currentDate, view]
  );

  const scheduleByDay = useMemo(() => {
    const map = new Map<string, ScheduleRow[]>();
    for (const s of schedules) {
      const key = s.shift_date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return map;
  }, [schedules]);

  function changeMonth(offset: number) {
    const d = new Date(currentDate);
    d.setMonth(d.getMonth() + offset);
    setCurrentDate(d);
  }

  function changeWeek(offset: number) {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + offset * 7);
    setCurrentDate(d);
  }

  function handleSelectDate(d: Date) {
    setSelectedDate(d);
  }

  async function handleSaveShift() {
    if (!selectedEmployeeId) return;
    const dateKey = toDateKey(selectedDate);
    const body = {
      action: "create",
      employeeId: selectedEmployeeId,
      shiftDate: dateKey,
      hours: Number(hours) || 0,
      notes: notes.trim() || null,
    };

    const res = await fetch("/api/staff/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.error("Failed to save shift");
      return;
    }

    const created: ScheduleRow = await res.json();
    setSchedules((prev) => [...prev, created]);
    router.refresh();
  }

  async function handleDeleteShift(id: string) {
    const res = await fetch("/api/staff/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });

    if (!res.ok) {
      console.error("Failed to delete shift");
      return;
    }

    setSchedules((prev) => prev.filter((s) => s.id !== id));
    router.refresh();
  }

  const selectedKey = toDateKey(selectedDate);
  const selectedDaySchedules = scheduleByDay.get(selectedKey) ?? [];

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <button
            type="button"
            className="px-2 py-1 border rounded hover:bg-neutral-900"
            onClick={() =>
              view === "week" ? changeWeek(-1) : changeMonth(-1)
            }
          >
            Prev
          </button>
          <button
            type="button"
            className="px-2 py-1 border rounded hover:bg-neutral-900"
            onClick={() => setCurrentDate(new Date())}
          >
            Today
          </button>
          <button
            type="button"
            className="px-2 py-1 border rounded hover:bg-neutral-900"
            onClick={() =>
              view === "week" ? changeWeek(1) : changeMonth(1)
            }
          >
            Next
          </button>
          <span className="ml-3 font-medium">
            {currentDate.toLocaleDateString(undefined, {
              year: "numeric",
              month: "long",
            })}
          </span>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <button
            type="button"
            className={`px-3 py-1 rounded border ${
              view === "week" ? "bg-neutral-900" : "hover:bg-neutral-900"
            }`}
            onClick={() => setView("week")}
          >
            Week (2 weeks)
          </button>
          <button
            type="button"
            className={`px-3 py-1 rounded border ${
              view === "month" ? "bg-neutral-900" : "hover:bg-neutral-900"
            }`}
            onClick={() => setView("month")}
          >
            Month
          </button>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="border rounded-lg overflow-hidden">
        <div className="grid grid-cols-7 text-xs bg-neutral-900/60">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="px-2 py-2 text-center font-semibold">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 text-xs">
          {days.map((day) => {
            const key = day.dateKey;
            const isSelected = key === selectedKey;
            const daySchedules = scheduleByDay.get(key) ?? [];
            return (
              <button
                key={key}
                type="button"
                onClick={() => handleSelectDate(day.date)}
                className={[
                  "h-28 p-1 border-t border-r text-left align-top overflow-hidden",
                  !day.inCurrentMonth ? "opacity-40" : "",
                  isSelected ? "bg-neutral-900" : "hover:bg-neutral-900/40",
                ].join(" ")}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold">
                    {day.date.getDate()}
                  </span>
                  {daySchedules.length > 0 && (
                    <span className="text-[10px] text-neutral-400">
                      {daySchedules.length} shift
                      {daySchedules.length > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                <div className="space-y-0.5">
                  {daySchedules.slice(0, 3).map((s) => {
                    const emp = employees.find(
                      (e) => e.id === s.employee_id
                    );
                    return (
                      <div
                        key={s.id}
                        className="truncate text-[11px] text-neutral-200"
                      >
                        {emp?.display_name ?? "Staff"} · {s.hours}h
                      </div>
                    );
                  })}
                  {daySchedules.length > 3 && (
                    <div className="text-[10px] text-neutral-400">
                      +{daySchedules.length - 3} more…
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Editor panel */}
      <div className="grid gap-4 md:grid-cols-2 text-sm">
        <div className="space-y-3">
          <h2 className="text-base font-semibold">Add shift</h2>
          <div className="space-y-2">
            <div>
              <div className="text-xs text-neutral-400">Date</div>
              <div className="mt-0.5">
                {selectedDate.toLocaleDateString(undefined, {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </div>
            </div>
            <div>
              <label className="text-xs text-neutral-400 block mb-1">
                Employee
              </label>
              <select
                className="w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1"
                value={selectedEmployeeId}
                onChange={(e) => setSelectedEmployeeId(e.target.value)}
              >
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.display_name || "Unnamed"}
                    {e.is_active === false ? " (inactive)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-neutral-400 block mb-1">
                Hours
              </label>
              <input
                type="number"
                step="0.25"
                className="w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-neutral-400 block mb-1">
                Notes (optional)
              </label>
              <textarea
                className="w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            <button
              type="button"
              onClick={handleSaveShift}
              className="mt-2 inline-flex items-center justify-center rounded border border-emerald-600 px-3 py-1.5 text-sm font-medium hover:bg-emerald-900/40"
            >
              Save shift
            </button>
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-base font-semibold">
            Shifts on{" "}
            {selectedDate.toLocaleDateString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
          </h2>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-neutral-900/60">
                <tr>
                  <th className="p-2 text-left">Employee</th>
                  <th className="p-2 text-right">Hours</th>
                  <th className="p-2 text-left">Notes</th>
                  <th className="p-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {selectedDaySchedules.map((s) => {
                  const emp = employees.find(
                    (e) => e.id === s.employee_id
                  );
                  return (
                    <tr key={s.id} className="border-t">
                      <td className="p-2">
                        {emp?.display_name ?? "Staff"}
                      </td>
                      <td className="p-2 text-right">{s.hours}</td>
                      <td className="p-2 max-w-[160px] truncate">
                        {s.notes ?? "—"}
                      </td>
                      <td className="p-2 text-right">
                        <button
                          type="button"
                          className="text-xs underline text-red-400"
                          onClick={() => handleDeleteShift(s.id)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {selectedDaySchedules.length === 0 && (
                  <tr>
                    <td
                      className="p-3 text-neutral-400 text-center"
                      colSpan={4}
                    >
                      No shifts for this day yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function buildCalendarDays(current: Date, view: ViewMode): CalendarDay[] {
  const days: CalendarDay[] = [];
  if (view === "week") {
    // show 2 full weeks: current week + next
    const start = startOfWeek(current);
    for (let i = 0; i < 14; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push({
        date: d,
        dateKey: toDateKey(d),
        inCurrentMonth: d.getMonth() === current.getMonth(),
      });
    }
  } else {
    // month view: full weeks covering the month
    const firstOfMonth = new Date(current.getFullYear(), current.getMonth(), 1);
    const start = startOfWeek(firstOfMonth);
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push({
        date: d,
        dateKey: toDateKey(d),
        inCurrentMonth: d.getMonth() === current.getMonth(),
      });
    }
  }
  return days;
}

function startOfWeek(d: Date): Date {
  const day = d.getDay(); // 0=Sun
  const diff = d.getDate() - day; // start on Sunday
  return new Date(d.getFullYear(), d.getMonth(), diff);
}
