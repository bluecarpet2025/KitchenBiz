"use client";

import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";

/* ----------------------------- shared helpers ----------------------------- */
const currency = (n: number) =>
  (Number(n) || 0).toLocaleString(undefined, { style: "currency", currency: "USD" });

const defaultTick = { fontSize: 12, fill: "var(--neutral-400, #aaa)" };
const gridStroke = "var(--neutral-800, #2a2a2a)";
const stroke1 = "var(--chart-1, #16a085)"; // sales
const stroke2 = "var(--chart-2, #3b82f6)"; // expenses
const stroke3 = "var(--chart-3, #ef476f)"; // extra
const piePalette = [stroke1, stroke2, stroke3, "#22c55e", "#eab308", "#38bdf8", "#c084fc", "#f97316"];

/* ---------------------- Sales vs Expenses (line chart) ---------------------- */
export function SalesVsExpenses({
  data,
}: {
  data: Array<{ key: string; sales: number; expenses: number; profit: number }>;
}) {
  return (
    <div className="text-sm opacity-80">
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
            <XAxis dataKey="key" tick={defaultTick} />
            <YAxis tick={defaultTick} />
            <Tooltip formatter={(v: any) => currency(v as number)} labelFormatter={(l: any) => String(l)} />
            <Legend />
            <Line type="monotone" dataKey="expenses" stroke={stroke2} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="sales" stroke={stroke1} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* -------------------------- Expense breakdown (donut) ----------------------- */
export function ExpenseDonut({
  data,
}: {
  data: Array<{ name: string; value: number }>;
}) {
  const total = data.reduce((a, b) => a + (Number(b.value) || 0), 0);

  return (
    <div className="text-sm opacity-80">
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={60}
              outerRadius={90}
              label={(e: any) => {
                const val = Number(e.value || 0);
                const pct = total > 0 ? Math.round((val / total) * 100) : 0;
                return `${e.name}: ${currency(val)} (${pct}%)`;
              }}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={piePalette[i % piePalette.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ------------------------------- Weekday bars ------------------------------- */
export function WeekdayBars({
  labels,
  values,
}: {
  labels: string[];
  values: number[];
}) {
  const rows = labels.map((l, i) => ({ name: l, value: values[i] || 0 }));
  return (
    <div className="text-sm opacity-80">
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows}>
            <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={defaultTick} />
            <YAxis tick={defaultTick} />
            <Tooltip formatter={(v: any) => currency(v as number)} />
            <Bar dataKey="value" fill={stroke1} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* -------------------------------- Top items -------------------------------- */
export function TopItems({
  data,
}: {
  data: Array<{ name: string; value: number }>;
}) {
  return (
    <div className="text-sm opacity-80">
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={defaultTick} />
            <YAxis tick={defaultTick} />
            <Tooltip formatter={(v: any) => currency(v as number)} />
            <Bar dataKey="value" fill={stroke1} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
