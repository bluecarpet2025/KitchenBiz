"use client";

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
import * as React from "react";

/** neutral-friendly tick */
const defaultTick = { fontSize: 12, fill: "var(--neutral-300, #aaa)" };
const gridStroke = "var(--neutral-800, #2a2a2a)";
const stroke1 = "var(--chart-1, #6abf69)"; // green-ish
const stroke2 = "var(--chart-2, #5aa2e6)"; // blue-ish
const stroke3 = "var(--chart-3, #f2a54a)"; // orange-ish
const piePalette = [stroke1, stroke2, stroke3, "#22c55e", "#3b82f6", "#a78bfa", "#f472b6"];

/** light currency formatter */
export const currency = (v: number) =>
  (v ?? 0).toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });

/** compact dollar formatter for axis */
const currencyShort = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
};

/* -------------------- Sales vs Expenses (multi-range) -------------------- */
export function SalesVsExpensesChart({
  data,
  xLabel,
}: {
  data: Array<{ key: string; sales: number; expenses: number; profit: number }>;
  xLabel: string;
}) {
  return (
    <div className="border rounded p-3">
      <div className="text-sm opacity-80 mb-2">Sales vs Expenses — last {data.length} {xLabel}</div>
      <div className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
            <XAxis dataKey="key" tick={defaultTick} />
            <YAxis tick={defaultTick} tickFormatter={currencyShort} />
            <Tooltip
              contentStyle={{ background: "rgba(20,20,20,.95)", border: "1px solid #333" }}
              formatter={(v: any, name: string) => [currency(Number(v)), name]}
              labelFormatter={(l) => `${xLabel}: ${l}`}
            />
            <Legend />
            <Line type="monotone" dataKey="expenses" name="expenses" stroke={stroke2} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="sales" name="sales" stroke={stroke1} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* -------------------- Expenses donut + legend -------------------- */
export function ExpenseDonut({
  data,
  title = "Expense breakdown — current range",
}: {
  data: Array<{ name: string; value: number; pct?: number }>;
  title?: string;
}) {
  const total = data.reduce((s, r) => s + (r.value ?? 0), 0);
  return (
    <div className="border rounded p-3">
      <div className="text-sm opacity-80 mb-2">{title}</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 items-center">
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip
                contentStyle={{ background: "rgba(20,20,20,.95)", border: "1px solid #333" }}
                formatter={(v: any, name: string) => [currency(Number(v)), name]}
              />
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius={50}
                outerRadius={80}
                stroke="none"
                isAnimationActive={false}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={piePalette[i % piePalette.length]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="space-y-1 text-sm">
          {data.map((r, i) => {
            const pct = total ? Math.round(((r.value ?? 0) / total) * 100) : 0;
            return (
              <div key={r.name} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block w-3 h-3 rounded-sm"
                    style={{ background: piePalette[i % piePalette.length] }}
                  />
                  <span className="opacity-90">{r.name}</span>
                </div>
                <div className="tabular-nums opacity-90">
                  {currency(r.value ?? 0)} <span className="opacity-60">({pct}%)</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* -------------------- Top Items (current range) -------------------- */
export function TopItemsChart({
  data,
  title = "Top items — current range",
}: {
  data: Array<{ name: string; value: number; label?: string }>;
  title?: string;
}) {
  return (
    <div className="border rounded p-3">
      <div className="text-sm opacity-80 mb-2">{title}</div>
      <div className="h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={defaultTick} />
            <YAxis tick={defaultTick} tickFormatter={currencyShort} />
            <Tooltip
              contentStyle={{ background: "rgba(20,20,20,.95)", border: "1px solid #333" }}
              formatter={(v: any) => [currency(Number(v)), "revenue"]}
            />
            <Bar dataKey="value" fill={stroke1} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
