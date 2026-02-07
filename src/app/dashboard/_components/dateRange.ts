import { DateMode, Range } from "./dashboardTypes";

function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function startOfWeekMon(d: Date) {
  // Monday as start
  const x = startOfDay(d);
  const day = x.getDay(); // 0 Sun..6 Sat
  const diff = (day + 6) % 7; // Mon->0, Sun->6
  return addDays(x, -diff);
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function startOfYear(d: Date) {
  return new Date(d.getFullYear(), 0, 1);
}

export function resolveRange(searchParams: Record<string, string | string[] | undefined>): Range {
  const now = new Date();
  const modeRaw = (searchParams.mode as string | undefined) ?? "month";
  const mode = (["today", "week", "month", "ytd", "custom"] as const).includes(modeRaw as any)
    ? (modeRaw as DateMode)
    : "month";

  if (mode === "custom") {
    const start = (searchParams.start as string | undefined) ?? toISODate(startOfMonth(now));
    const end = (searchParams.end as string | undefined) ?? toISODate(addDays(startOfDay(now), 1));

    // Minimal guard: if start >= end, fall back to month-to-date
    if (start >= end) {
      const s = toISODate(startOfMonth(now));
      const e = toISODate(addDays(startOfDay(now), 1));
      return { mode: "month", start: s, end: e };
    }
    return { mode, start, end };
  }

  if (mode === "today") {
    const s = toISODate(startOfDay(now));
    const e = toISODate(addDays(startOfDay(now), 1));
    return { mode, start: s, end: e };
  }

  if (mode === "week") {
    const s = toISODate(startOfWeekMon(now));
    const e = toISODate(addDays(startOfDay(now), 1));
    return { mode, start: s, end: e };
  }

  if (mode === "ytd") {
    const s = toISODate(startOfYear(now));
    const e = toISODate(addDays(startOfDay(now), 1));
    return { mode, start: s, end: e };
  }

  // month
  const s = toISODate(startOfMonth(now));
  const e = toISODate(addDays(startOfDay(now), 1));
  return { mode: "month", start: s, end: e };
}
