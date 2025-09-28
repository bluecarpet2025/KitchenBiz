"use client";

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
import * as React from "react";

const defaultTick = { fontSize: 12, fill: "var(--neutral-400, #aaa)" };
const gridStroke = "var(--neutral-800, #2a2a2a)";
const stroke1 = "var(--chart-1, #3ea65f)"; // greenish
const stroke2 = "var(--chart-2, #4aa3ff)"; // blue
const piePalette = [stroke1, stroke2, "#22c55e", "#eab308", "#38bdf8", "#f472b6", "#f97316"];

type SvEPoint = { key: string; sales: number; expenses: number; profit: number };

export function SalesVsExpensesChart({
  data,
  range,
}: {
  data: SvEPoint[];
  range: "today" | "week" | "month" | "ytd";
}) {
  const xLabel =
    range === "today" ? "day" : range === "week" ? "week" : range === "ytd" ? "month" : "month";
  return (
    <div className="border rounded p-3">
      <div className="text-sm opacity-80 mb-2">
        Sales vs Expenses —{" "}
        {range === "today" ? "last 12 days" : range === "week" ? "last 12 weeks" : range === "ytd" ? "YTD (by month)" : "last 12 months"}
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data}>
          <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
          <XAxis dataKey="key" tick={defaultTick} />
          <YAxis tick={defaultTick} />
          <Tooltip formatter={(v: any) => currency(v)} />
          <Legend />
          <Line type="monotone" dataKey="sales" stroke={stroke1} dot={false} strokeWidth={2} />
          <Line type="monotone" dataKey="expenses" stroke={stroke2} dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
      <div className="text-xs opacity-60 mt-1">X axis: {xLabel}</div>
    </div>
  );
}

export function ExpenseDonut({
  data,
}: {
  data: Array<{ name: string; value: number; label?: string }>;
}) {
  const total = data.reduce((s, d) => s + (Number(d.value) || 0), 0);
  const withPct = data.map((d) => ({
    ...d,
    label:
      d.label ??
      `${d.name} – ${total > 0 ? Math.round((Number(d.value) / total) * 100) : 0}%`,
  }));
  return (
    <div className="border rounded p-3">
      <div className="text-sm opacity-80 mb-2">Expense breakdown — current range</div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={withPct}
              dataKey="value"
              nameKey="name"
              innerRadius={48}
              outerRadius={80}
              paddingAngle={2}
            >
              {withPct.map((_, i) => (
                <Cell key={i} fill={piePalette[i % piePalette.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(v: any, _k, item: any) => [currency(v), item?.payload?.label]} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function TopItemsChart({ data }: { data: Array<{ name: string; value: number }> }) {
  return (
    <div className="border rounded p-3">
      <div className="text-sm opacity-80 mb-2">Top items — current range</div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={defaultTick} interval={0} angle={0} />
            <YAxis tick={defaultTick} />
            <Tooltip formatter={(v: any) => currency(v)} />
            <Bar dataKey="value" fill={stroke1} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function currency(v: number) {
  return (Number(v) || 0).toLocaleString(undefined, { style: "currency", currency: "USD" });
}
