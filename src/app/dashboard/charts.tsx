"use client";

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Area, Legend, PieChart, Pie, Cell, BarChart, Bar
} from "recharts";
import * as React from "react";

const defaultTick = { fontSize: 12, fill: "var(--neutral-400, #aaa)" };
const gridStroke   = "var(--neutral-800, #2a2a2a)";
const stroke1      = "var(--chart-1, #1eae55)";   // sales
const stroke2      = "var(--chart-2, #3b82f6)";   // expenses
const stroke3      = "var(--chart-3, #ffa726)";   // profit (area)
const piePalette   = [ "#f59e0b", "#22c55e", "#3b82f6", "#38bdf8", "#c084fc", "#f97316" ];

type SeriesRow = { label: string; sales: number; expenses: number; profit?: number };

export function SalesVsExpensesChart({
  data,
  subtitle,
}: {
  data: SeriesRow[];
  subtitle?: string;
}) {
  return (
    <div className="border rounded p-4">
      <div className="text-sm opacity-80 mb-2">Sales vs Expenses — {subtitle ?? "last periods"}</div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={defaultTick} />
            <YAxis tick={defaultTick} />
            <Tooltip formatter={(v: any) => currency(v)} />
            <Legend />
            <Area type="monotone" dataKey="profit" fill="rgba(244,114,182,0.1)" stroke="transparent" />
            <Line type="monotone" dataKey="sales"    stroke={stroke1} strokeWidth={2} dot={false} />
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
  const total = data.reduce((a, b) => a + (b?.value ?? 0), 0);
  return (
    <div className="border rounded p-4">
      <div className="text-sm opacity-80 mb-2">Expense breakdown — current range</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80}>
                {data.map((_, i) => (
                  <Cell key={i} fill={piePalette[i % piePalette.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: any) => currency(v)} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="text-sm">
          <table className="w-full">
            <tbody>
              {data.map((r, i) => {
                const pct = total > 0 ? Math.round((r.value / total) * 100) : 0;
                return (
                  <tr key={r.name} className="border-b last:border-0">
                    <td className="py-1">
                      <span
                        className="inline-block w-2 h-2 rounded-sm mr-2 align-middle"
                        style={{ background: piePalette[i % piePalette.length] }}
                      />
                      {r.name}
                    </td>
                    <td className="py-1 text-right">{currency(r.value)} <span className="opacity-60">({pct}%)</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function TopItemsChart({
  data,
}: {
  data: Array<{ name: string; revenue: number }>;
}) {
  const max = Math.max(1, ...data.map(d => d.revenue));
  return (
    <div className="border rounded p-4">
      <div className="text-sm opacity-80 mb-2">Top items — current range</div>
      {data.length === 0 ? (
        <div className="text-sm opacity-70">No items in this range.</div>
      ) : (
        <div className="space-y-2">
          {data.map((d) => (
            <div key={d.name} className="flex items-center gap-3">
              <div className="flex-1">
                <div className="flex justify-between text-sm">
                  <span className="opacity-80">{d.name}</span>
                  <span>{currency(d.revenue)}</span>
                </div>
                <div className="h-2 bg-neutral-800 rounded overflow-hidden">
                  <div className="h-2 bg-neutral-300" style={{ width: `${(d.revenue / max) * 100}%` }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function currency(n: number) {
  return (n || 0).toLocaleString(undefined, { style: "currency", currency: "USD" });
}
