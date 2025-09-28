"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  BarChart,
  Bar,
} from "recharts";
import * as React from "react";

const defaultTick = { fontSize: 12, fill: "var(--neutral-400, #aaa)" };
const gridStroke = "var(--neutral-800, #2a2a2a)";
const stroke1 = "var(--chart-1, #36a65f)"; // sales
const stroke2 = "var(--chart-2, #59a0e1)"; // expenses
const piePalette = [stroke2, "#22c55e", "#eab308", "#38bdf8", "#c084fc", "#f97316"];
const currency = (v: number) =>
  (v || 0).toLocaleString(undefined, { style: "currency", currency: "USD" });

export function SalesVsExpensesChart({
  data,
  label,
}: {
  data: Array<{ key: string; sales: number; expenses: number; profit: number }>;
  label: string;
}) {
  return (
    <div className="border rounded p-3">
      <div className="text-sm opacity-80 mb-2">Sales vs Expenses — {label}</div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
            <XAxis dataKey="key" tick={defaultTick} />
            <YAxis tick={defaultTick} tickFormatter={(v) => currency(v)} />
            <Tooltip formatter={(v: any) => currency(Number(v))} />
            <Line type="monotone" dataKey="sales" stroke={stroke1} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="expenses" stroke={stroke2} strokeWidth={2} dot={false} />
            <Legend />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function ExpenseDonut({
  data,
  label,
}: {
  data: Array<{ name: string; value: number; pct?: number }>;
  label: string;
}) {
  const total = data.reduce((s, r) => s + (r.value || 0), 0);
  return (
    <div className="border rounded p-3">
      <div className="text-sm opacity-80 mb-2">Expense breakdown — {label}</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-center">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70}>
                {data.map((_, i) => (
                  <Cell key={i} fill={piePalette[i % piePalette.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v: any) => currency(Number(v))}
                labelFormatter={(n) => String(n)}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="text-sm">
          {data.map((r, i) => {
            const pct = total ? Math.round((r.value / total) * 100) : 0;
            return (
              <div className="flex justify-between py-1 border-b border-neutral-800" key={i}>
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block w-3 h-3 rounded"
                    style={{ background: piePalette[i % piePalette.length] }}
                  />
                  <span>{r.name}</span>
                </div>
                <div className="tabular-nums">
                  {currency(r.value)} <span className="opacity-70">({pct}%)</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function TopItemsChart({
  data,
  label,
}: {
  data: Array<{ name: string; value: number }>;
  label: string;
}) {
  return (
    <div className="border rounded p-3">
      <div className="text-sm opacity-80 mb-2">Top items — {label}</div>
      <div className="h-64">
        {data.length === 0 ? (
          <div className="opacity-70 text-sm h-full flex items-center justify-center">
            No items in this range.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={defaultTick} />
              <YAxis tick={defaultTick} tickFormatter={(v) => currency(v)} />
              <Tooltip formatter={(v: any) => currency(Number(v))} />
              <Bar dataKey="value" fill={stroke1} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
