// src/lib/dates.ts
const pad2 = (n: number) => String(n).padStart(2, "0");

// ISO week-numbering year and week (IYYY / IW in Postgres)
function isoWeekParts(dIn?: Date) {
  const d = dIn ? new Date(dIn) : new Date();
  // Copy & normalize to UTC midnight to avoid TZ surprises
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  // Thursday of this week determines the ISO year
  const dayNum = date.getUTCDay() || 7; // Sun=0 -> 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const isoYear = date.getUTCFullYear();

  // Week number: count weeks since the Thursday of week 1
  const jan1 = new Date(Date.UTC(isoYear, 0, 1));
  const days = Math.floor((+date - +jan1) / 86400000) + 1;
  const isoWeek = Math.ceil(days / 7);
  return { isoYear, isoWeek };
}

export const addDays = (d: Date, days: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
};

export const todayStr = (d?: Date) => {
  const dt = d ?? new Date();
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
};

export const monthStr = (d?: Date) => {
  const dt = d ?? new Date();
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}`;
};

export const yearStr = (d?: Date) => {
  const dt = d ?? new Date();
  return String(dt.getFullYear());
};

export const weekStr = (d?: Date) => {
  const { isoYear, isoWeek } = isoWeekParts(d);
  // Matches Postgres format: IYYY-"W"IW -> 2025-W38
  return `${isoYear}-W${pad2(isoWeek)}`;
};
