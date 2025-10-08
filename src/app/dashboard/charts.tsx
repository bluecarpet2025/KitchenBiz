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

// styles
const defaultTick = { fontSize: 12, fill: "var(--neutral-400, #aaa)" };
const gridStroke = "var(--neutral-800, #222)";
const stroke1 = "var(--chart-1, #5bd3ff)"; // expenses
const stroke2 = "var(--chart-2, #9bf15f)"; // sales
const piePalette = ["#5bd3ff", "#22c55e", "#eab308", "#38bdf8", "#f97316", "#c084fc", "#f43f5e"];

type SeriesRow = { key: string; sales: number; expenses: number; profit: number };

export function SalesVsExpensesChart({ data }: { data: SeriesRow[] }) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
          <XAxis dataKey="key" tick={defaultTick} />
          <YAxis tick={defaultTick} />
          <Tooltip
            formatter={(v: any) =>
              typeof v === "number"
                ? v.toLocaleString(undefined, { style: "currency", currency: "USD" })
                : v
            }
          />
          <Legend />
          <Line type="monotone" dataKey="sales" stroke={stroke2} dot={false} strokeWidth={2} />
          <Line type="monotone" dataKey="expenses" stroke={stroke1} dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ExpenseDonut({
  data,
}: {
  data: Array<{ name: string; value: number; label: string }>;
}) {
  const total = data.reduce((a, b) => a + (b?.value ?? 0), 0);
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Tooltip formatter={(v: any, _n: any, p: any) => [p.payload.label, p.payload.name]} />
          <Legend />
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={60}
            outerRadius={90}
            stroke="var(--neutral-900, #111)"
            label={(p) => (total ? `${p.name}` : "")}
            isAnimationActive={false}
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

export function TopItemsChart({ data }: { data: Array<{ name: string; value: number }> }) {
  if (!data || data.length === 0) {
    return <div className="text-sm opacity-70 px-2 py-4">No items in this range.</div>;
  }
  // Render as bar chart (simple, readable)
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
          <XAxis dataKey="name" tick={defaultTick} />
          <YAxis tick={defaultTick} />
          <Tooltip
            formatter={(v: any) =>
              typeof v === "number"
                ? v.toLocaleString(undefined, { style: "currency", currency: "USD" })
                : v
            }
          />
          <Bar dataKey="value" fill="var(--chart-2, #9bf15f)" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function WeekdayBars({ data }: { data: number[] }) {
  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const max = Math.max(1, ...data);
  return (
    <div className="space-y-2">
      {labels.map((lbl, i) => (
        <div key={lbl} className="flex items-center gap-3">
          <div className="w-10 text-xs opacity-70">{lbl}</div>
          <div className="flex-1 h-2 bg-neutral-900 rounded">
            <div
              className="h-2 bg-neutral-200 rounded"
              style={{ width: `${(data[i] / max) * 100}%` }}
              title={data[i].toLocaleString(undefined, { style: "currency", currency: "USD" })}
            />
          </div>
          <div className="w-20 text-right text-xs">
            {data[i].toLocaleString(undefined, { style: "currency", currency: "USD" })}
          </div>
        </div>
      ))}
    </div>
  );
}
