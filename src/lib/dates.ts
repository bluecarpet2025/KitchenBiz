// src/lib/dates.ts
// Small date helpers that match how our SQL views key periods.

const pad = (n: number) => String(n).padStart(2, "0");

export const dayStr = (d: Date = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const monthStr = (d: Date = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

export const yearStr = (d: Date = new Date()) => String(d.getFullYear());

// ISO week algorithm (no deps). Returns YYYY-Www.
export const weekStr = (d: Date = new Date()) => {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  // Thursday in current week decides the year.
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const isoYear = date.getUTCFullYear();
  // Week number: count weeks since 1 Jan.
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(((+date - +yearStart) / 86400000 + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
};

// Convenience for relative ranges
export const addDays = (base: Date, days: number) => {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
};
