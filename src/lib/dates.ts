// src/lib/dates.ts
const pad2 = (n: number) => String(n).padStart(2, "0");

export const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

export const todayStr = (d = new Date()) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export const monthStr = (d = new Date()) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;

export const yearStr = (d = new Date()) => String(d.getFullYear());
