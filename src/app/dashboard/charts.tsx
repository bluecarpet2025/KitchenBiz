"use client";

import * as React from "react";
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

/* ---------- shared visuals ---------- */
const defaultTick = { fontSize: 12, fill: "var(--neutral-400, #aaa)" };
const gridStroke = "var(--neutral-800, #2a2a2a)";

const strokeSales = "var(--chart-1, #3ea65f)"; // sales
const strokeExpenses = "var(--chart-2, #4da3ff)"; // expenses
const piePalette = ["#3ea65f", "#22c55e", "#eab308", "#38bdf8", "#c084fc", "#f97316", "#f43f5e"];

/* single currency formatter (avoids toLocaleString typing quirks) */
const fmtCurrency = (n: number) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(Number(n) || 0);

/* ---------- Sales vs Expenses (line) ---------- */
export function SalesVsExpensesChart({
  data,
}: {
  data: Array<{ key: string; sales: number; expenses: number; profit: number }>;
}) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
          <XAxis dataKey="key" tick={defaultTick} />
          <YAxis tick={defaultTick} />
          <Tooltip formatter={(v: any) => fmtCurrency(Number(v) || 0)} />
          <Legend />
          <Line type="monotone" dataKey="expenses" stroke={strokeExpenses} dot={false} strokeWidth={2} />
          <Line type="monotone" dataKey="sales" stroke={strokeSales} dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------- Expense breakdown (donut) ---------- */
export function ExpenseDonut({
  data,
}: {
  data: Array<{ name: string; value: number }>;
}) {
  const total = data.reduce((a, b) => a + (Number(b.value) || 0), 0);

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Tooltip formatter={(v: any) => fmtCurrency(Number(v) || 0)} />
          <Legend />
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={60}
            outerRadius={90}
            stroke="none"
            label={(e: any) => {
              const val = Number(e?.value) || 0;
              const pct = total > 0 ? Math.round((val / total) * 100) : 0;
              return `${e?.name ?? "Unknown"}: ${fmtCurrency(val)} (${pct}%)`;
            }}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={piePalette[i % piePalette.length]} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------- Weekday revenue (bars) ---------- */
export function WeekdayBars({
  labels,
  values,
  formatter,
}: {
  labels: string[];
  values: number[];
  formatter?: (n: number) => string;
}) {
  const data = labels.map((k, i) => ({ name: k, value: Number(values[i] || 0) }));
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
          <XAxis dataKey="name" tick={defaultTick} />
          <YAxis tick={defaultTick} />
          <Tooltip formatter={(v: any) => (formatter ? formatter(Number(v) || 0) : fmtCurrency(Number(v) || 0))} />
          <Bar dataKey="value" stroke="none" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------- Top items (bars) ---------- */
export function TopItemsChart({
  data,
  formatter,
}: {
  data: Array<{ name: string; value: number }>;
  formatter?: (n: number) => string;
}) {
  const chartData = data.length ? data : [{ name: "No items", value: 0 }];
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData}>
          <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
          <XAxis dataKey="name" tick={defaultTick} />
          <YAxis tick={defaultTick} />
          <Tooltip formatter={(v: any) => (formatter ? formatter(Number(v) || 0) : fmtCurrency(Number(v) || 0))} />
          <Bar dataKey="value" stroke="none" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
