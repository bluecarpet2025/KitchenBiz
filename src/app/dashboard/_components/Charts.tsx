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
  BarChart,
  Bar,
} from "recharts";

const currency = (n: number) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(Number(n) || 0);

const defaultTick = { fontSize: 12, fill: "var(--neutral-400, #aaa)" };
const gridStroke = "var(--neutral-800, #2a2a2a)";

const strokeSales = "var(--chart-1, #3ea65f)";
const strokeExpenses = "var(--chart-2, #4da3ff)";
const strokeProfit = "var(--chart-3, #eab308)";

// Optional hover/active fill (lighter highlight).
const activeExpensesFill = "var(--chart-2-active, #93c5fd)";
const activeSalesFill = "var(--chart-1-active, #86efac)";

export function SalesExpensesProfitLine({
  data,
}: {
  data: Array<{ key: string; net_sales: number; expenses: number; profit: number }>;
}) {
  const rows = data?.length ? data : [{ key: "—", net_sales: 0, expenses: 0, profit: 0 }];

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows}>
          <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
          <XAxis dataKey="key" tick={defaultTick} />
          <YAxis tick={defaultTick} />
          <Tooltip formatter={(v: any) => currency(Number(v) || 0)} />
          <Legend />
          <Line type="monotone" dataKey="expenses" stroke={strokeExpenses} dot={false} strokeWidth={2} />
          <Line type="monotone" dataKey="net_sales" stroke={strokeSales} dot={false} strokeWidth={2} />
          <Line type="monotone" dataKey="profit" stroke={strokeProfit} dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CategoryBars({
  data,
}: {
  data: Array<{ name: string; value: number }>;
}) {
  const rows = data?.length ? data : [{ name: "—", value: 0 }];

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows}>
          <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
          <XAxis dataKey="name" tick={defaultTick} />
          <YAxis tick={defaultTick} />
          <Tooltip formatter={(v: any) => currency(Number(v) || 0)} />
          <Bar dataKey="value" fill={strokeExpenses} stroke="none" activeBar={{ fill: activeExpensesFill }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * WeekdayBars: used for "by weekday" charts (sales or purchasing)
 */
export function WeekdayBars({
  data,
  valueFormatter,
  label,
}: {
  data: Array<{ name: string; value: number }>;
  valueFormatter?: (n: number) => string;
  label?: string;
}) {
  const rows = data?.length ? data : [{ name: "—", value: 0 }];

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows}>
          <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
          <XAxis dataKey="name" tick={defaultTick} />
          <YAxis tick={defaultTick} />
          <Tooltip
            formatter={(v: any) =>
              valueFormatter ? valueFormatter(Number(v) || 0) : currency(Number(v) || 0)
            }
            labelFormatter={(l: any) => (label ? `${label}: ${String(l)}` : String(l))}
          />
          <Bar dataKey="value" fill={strokeSales} stroke="none" activeBar={{ fill: activeSalesFill }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * SimpleBars: generic "name/value" bar chart (optional reuse later)
 */
export function SimpleBars({
  data,
  fill,
  activeFill,
  valueFormatter,
}: {
  data: Array<{ name: string; value: number }>;
  fill?: string;
  activeFill?: string;
  valueFormatter?: (n: number) => string;
}) {
  const rows = data?.length ? data : [{ name: "—", value: 0 }];
  const barFill = fill ?? strokeSales;
  const barActive = activeFill ?? activeSalesFill;

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows}>
          <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
          <XAxis dataKey="name" tick={defaultTick} />
          <YAxis tick={defaultTick} />
          <Tooltip formatter={(v: any) => (valueFormatter ? valueFormatter(Number(v) || 0) : currency(Number(v) || 0))} />
          <Bar dataKey="value" fill={barFill} stroke="none" activeBar={{ fill: barActive }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
