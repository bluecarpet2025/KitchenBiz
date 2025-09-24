// src/lib/dates.ts
// Date helpers that return strings matching the formats used by the SQL views.

const pad2 = (n: number) => String(n).padStart(2, "0");

/** YYYY-MM-DD for the given date (or today). */
export function todayStr(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${y}-${m}-${day}`;
}

/** YYYY-MM for the given date (or today). */
export function monthStr(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  return `${y}-${m}`;
}

/** YYYY for the given date (or today). */
export function yearStr(d: Date = new Date()): string {
  return `${d.getFullYear()}`;
}

/** Add (or subtract) whole days and return a **new** Date. */
export function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

/**
 * ISO week-numbering year and week, formatted as "YYYY-Www".
 * Matches what your views output (e.g. 2025-W35).
 */
export function weekStr(d: Date = new Date()): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));

  // Shift to nearest Thursday: current date + 4 - current day number (Mon=1, Sun=7)
  const dayNum = (date.getUTCDay() + 6) % 7; // 0..6 (Mon=0)
  date.setUTCDate(date.getUTCDate() - dayNum + 3);

  // ISO week-year is the year of that Thursday
  const isoYear = date.getUTCFullYear();

  // First Thursday of ISO year
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);

  // Week number: count weeks between the two Thursdays
  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / 604800000);

  return `${isoYear}-W${pad2(week)}`;
}
