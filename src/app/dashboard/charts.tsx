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
  Area,
  Legend,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";

// Client-only currency helper (kept internal to this file)
const currency = (n: number) =>
  (n ?? 0).toLocaleString(undefined, { style: "currency", currency: "USD" });

const defaultTick = { fontSize: 12, fill: "var(--neutral-400, #aaa)" };
const gridStroke = "var(--neutral-800, #2a2a2a)";
const stroke1 = "var(--chart-1, #1ea653)"; // lime-ish
const stroke2 = "var(--chart-2, #2e86ff)"; // blue-ish
const stroke3 = "var(--chart-3, #ffaf26)"; // orange-ish
const piePalette = [stroke1, stroke2, stroke3, "#22c55e", "#82ca9d", "#38bdf8", "#a78bfa", "#f97316"];

/** Sales vs Expenses (responsive)
 * Expects data keyed by `key` with `sales`, `expenses`, optionally `profit`.
 */
export function SalesVsExpensesChart({
  data,
  xLabel = "",
}: {
  data: Array<{ key: string; sales: number; expenses: number; profit?: number }>;
  xLabel?: string;
}) {
  return (
    <div className="border rounded p-3 h-[250px] md:h-[280px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
          <XAxis dataKey="key" tick={defaultTick} label={xLabel ? { value: xLabel, position: "insideBottom", offset: -5, fill: "#bbb", fontSize: 12 } : undefined} />
          <YAxis tick={defaultTick} tickFormatter={v => currency(Number(v))} />
          <Tooltip formatter={(v: any) => currency(Number(v))} />
          <Legend />
          {/* Optional profit area for subtle background */}
          <Area type="monotone" dataKey="profit" fill="rgba(60,200,140,0.10)" stroke="transparent" />
          <Line type="monotone" dataKey="expenses" stroke={stroke2} strokeWidth={2} dot={false} name="expenses" />
          <Line type="monotone" dataKey="sales" stroke={stroke1} strokeWidth={2} dot={false} name="sales" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Expenses Donut */
export function ExpenseDonut({
  data,
}: {
  data: Array<{ name: string; value: number; label?: string }>;
}) {
  return (
    <div className="border rounded p-3 h-[250px] md:h-[280px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Tooltip formatter={(v: any) => currency(Number(v))} />
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={55}
            outerRadius={80}
            label={(d: any) => (d.payload?.label ? d.payload.label : d.name)}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={piePalette[i % piePalette.length]} />
            ))}
          </Pie>
          {/* Legend-like right column via HTML is shown in the parent (server) card */}
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Top items (bar) */
export function TopItemsChart({
  data,
}: {
  data: Array<{ name: string; revenue: number }>;
}) {
  return (
    <div className="border rounded p-3 h-[250px] md:h-[280px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
          <XAxis dataKey="name" tick={defaultTick} interval={0} angle={0} height={40} />
          <YAxis tick={defaultTick} tickFormatter={(v) => currency(Number(v))} />
          <Tooltip formatter={(v: any) => currency(Number(v))} />
          <Bar dataKey="revenue" name="Revenue" stroke={stroke1} fill={stroke1} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
