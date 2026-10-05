"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type TrendPoint = { month: string; income: number; expense: number };

// Hex values mirror the CSS tokens (--income / --expense); Recharts needs concrete colors.
const INCOME = "#0f7a5a";
const EXPENSE = "#b4472f";

export function TrendChart({ data, currency }: { data: TrendPoint[]; currency: string }) {
  const fmt = (v: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(v);
  const full = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(v);
  return (
    <div role="img" aria-label="Monthly income and expense for the last 12 months" className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4e2da" />
          <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
          <YAxis tickFormatter={fmt} tickLine={false} axisLine={false} fontSize={12} width={60} />
          <Tooltip formatter={(v) => full(Number(v))} cursor={{ fill: "rgba(15,92,74,0.06)" }} />
          <Legend />
          <Bar dataKey="income" name="Income" fill={INCOME} radius={[3, 3, 0, 0]} />
          <Bar dataKey="expense" name="Expense" fill={EXPENSE} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
