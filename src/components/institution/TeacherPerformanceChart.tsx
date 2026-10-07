"use client";

import dynamic from "next/dynamic";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type TeacherPerformancePoint = {
  id: number;
  label: string;
  title: string;
  type: string;
  average: number;
  students: number;
};

function TeacherPerformanceChartInner({ data }: { data: TeacherPerformancePoint[] }) {
  if (data.length === 0) {
    return <div className="flex h-full items-center justify-center rounded-md border border-dashed border-stone-300 bg-stone-50"><p className="max-w-xs text-center text-sm text-stone-500">No published daily, weekly, or monthly results in this period.</p></div>;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 12, right: 14, left: -18, bottom: 6 }}>
        <CartesianGrid stroke="#e7e5e4" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#78716c", fontSize: 11 }} minTickGap={24} />
        <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: "#78716c", fontSize: 11 }} width={42} />
        <Tooltip
          contentStyle={{ border: "1px solid #d6d3d1", borderRadius: 6, boxShadow: "0 8px 20px rgb(0 0 0 / 0.08)" }}
          labelStyle={{ color: "#1c1917", fontWeight: 600 }}
          formatter={(value) => [`${Number(value ?? 0).toFixed(1)}%`, "Class average"]}
        />
        <Line type="monotone" dataKey="average" name="Class average" stroke="#243b53" strokeWidth={3} dot={{ r: 4, fill: "#fff", strokeWidth: 2 }} activeDot={{ r: 6, fill: "#e63946", strokeWidth: 0 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export const TeacherPerformanceChart = dynamic(
  () => Promise.resolve(TeacherPerformanceChartInner),
  { ssr: false, loading: () => <div className="h-full animate-pulse rounded-md bg-stone-100" /> },
);
