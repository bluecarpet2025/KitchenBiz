"use client";

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, Legend,
  PieChart, Pie, Cell,
  BarChart, Bar,
} from "recharts";
import * as React from "react";

const defaultTick = { fontSize: 12, fill: "var(--neutral-400, #aaa)" };
const gridStroke = "var(--neutral-800, #2a2a2a)";
const stroke1 = "var(--chart-1, #a3e635)"; // lime-ish
const stroke2 = "var(--chart-2, #60a5fa)"; // blue-ish
const stroke3 = "var(--chart-3, #f472b6)"; // pink-ish
const piePalette = [stroke1, stroke2, stroke3, "#f59e0b", "#22c55e", "#eab308", "#38bdf8", "#c084fc", "#f97316"];

export function SalesVsExpensesChart({
  data,
}: {
  data: Array<{ month: string; sales: number; expenses: number; profit: number }>;
}) {
  return (
    <div className="border rounded p-4">
      <div className="text-sm opacity-80">Sales vs Expenses — last 12 months</div>
      <div className="mt-3 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
            <XAxis dataKey="month" tick={defaultTick} />
            <YAxis tick={defaultTick} />
            <Tooltip formatter={(v: any) => currency(v)} />
            <Legend />
            {/* Profit area (subtle) */}
            <Area type="monotone" dataKey="profit" fill="rgba(244,114,182,0.1)" stroke="transparent" />
            <Line type="monotone" dataKey="sales" stroke={stroke1} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="expenses" stroke={stroke2} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function ExpenseDonut({
  data,
}: {
  data: Array<{ name: string; value: number }>;
}) {
  const total = data.reduce((a, r) => a + r.value, 0) || 1;
  return (
    <div className="border rounded p-4">
      <div className="text-sm opacity-80">Expense breakdown — current range</div>
      <div className="mt-3 h-64 grid grid-cols-1 md:grid-cols-2 gap-2">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip formatter={(v: any) => currency(v)} />
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius={50}
                outerRadius={80}
                stroke="none"
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={piePalette[i % piePalette.length]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="text-sm">
          {data.map((r, i) => {
            const pct = Math.round((r.value / total) * 100);
            return (
              <div key={r.name} className="flex items-center justify-between py-1 border-b border-neutral-800">
                <div className="flex items-center gap-2">
                  <span className="inline-block w-3 h-3 rounded-sm" style={{ background: piePalette[i % piePalette.length] }} />
                  <span className="opacity-80">{r.name}</span>
                </div>
                <div className="tabular-nums">{currency(r.value)} <span className="opacity-60">({pct}%)</span></div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function TopItemsBar({
  data,
  title = "Top items — current range",
}: {
  data: Array<{ name: string; revenue: number }>;
  title?: string;
}) {
  return (
    <div className="border rounded p-4">
      <div className="text-sm opacity-80">{title}</div>
      <div className="mt-3 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={defaultTick} />
            <YAxis tick={defaultTick} />
            <Tooltip formatter={(v: any) => currency(v)} />
            <Bar dataKey="revenue" fill={stroke3} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ---------- helpers ---------- */
function currency(n: number) {
  return (n || 0).toLocaleString(undefined, { style: "currency", currency: "USD" });
}
