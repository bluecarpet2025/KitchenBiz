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

const defaultTick = { fontSize: 12, fill: "var(--neutral-400, #aaa)" };
const gridStroke = "var(--neutral-800, #2a2a2a)";
const stroke1 = "var(--chart-1, #3ea65f)";   // green-ish
const stroke2 = "var(--chart-2, #4094ff)";   // blue-ish
const stroke3 = "var(--chart-3, #ffaf26)";   // orange-ish
const piePalette = [stroke1, stroke2, stroke3, "#225c5e", "#eab308", "#38bdf8", "#c084fc", "#f97316"];

const currency = (v?: number) =>
  (v ?? 0).toLocaleString(undefined, { style: "currency", currency: "USD" });

/* ---------------------------- Sales vs Expenses ---------------------------- */
export function SalesVsExpensesChart({
  data,
}: {
  data: Array<{ month: string; sales: number; expenses: number; profit: number }>;
}) {
  return (
    <div className="border rounded p-4">
      <div className="text-sm opacity-80 mb-2">Sales vs Expenses — last 12 months</div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
            <XAxis dataKey="month" tick={defaultTick} />
            <YAxis tick={defaultTick} />
            <Tooltip formatter={(v: any) => currency(Number(v))} />
            <Legend />
            <Line type="monotone" dataKey="expenses" stroke={stroke2} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="sales" stroke={stroke1} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ------------------------------ Expense donut ----------------------------- */
export function ExpenseDonut({
  data,
  title = "Expense breakdown — current range",
}: {
  data: Array<{ name: string; value: number }>;
  title?: string;
}) {
  const total = data.reduce((a, b) => a + (b.value || 0), 0);
  return (
    <div className="border rounded p-4">
      <div className="text-sm opacity-80 mb-2">{title}</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
        <div className="h-60">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip formatter={(v: any) => currency(Number(v))} />
              <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
                {data.map((_, i) => (
                  <Cell key={i} fill={piePalette[i % piePalette.length]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="text-sm">
          {data.map((d, i) => (
            <div key={d.name} className="flex justify-between py-1 border-b border-neutral-800">
              <div className="flex items-center gap-2">
                <span
                  className="inline-block w-3 h-3 rounded-full"
                  style={{ background: piePalette[i % piePalette.length] }}
                />
                {d.name}
              </div>
              <div className="opacity-80">
                {currency(d.value)}{" "}
                <span className="opacity-60">({total ? Math.round((d.value / total) * 100) : 0}%)</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------- Top items -------------------------------- */
export function TopItemsChart({
  data,
}: {
  data: Array<{ name: string; revenue: number }>;
}) {
  return (
    <div className="border rounded p-4">
      <div className="text-sm opacity-80 mb-2">Top items — current range</div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={[...data].reverse()} // smallest at top, biggest at bottom visually
            layout="vertical"
            margin={{ left: 8, right: 12, top: 10, bottom: 0 }}
          >
            <CartesianGrid stroke={gridStroke} horizontal={false} />
            <XAxis type="number" tick={defaultTick} />
            <YAxis
              dataKey="name"
              type="category"
              tick={defaultTick}
              width={120}
              interval={0}
            />
            <Tooltip formatter={(v: any) => currency(Number(v))} />
            <Bar dataKey="revenue" fill={stroke3} radius={[3, 3, 3, 3]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
