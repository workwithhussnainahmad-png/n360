"use client";

import dynamic from "next/dynamic";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

function ClassDistributionChartInner({ data }: { data: { name: string, value: number }[] }) {
  if (!data || data.length === 0 || data.every(d => d.value === 0)) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <p className="text-stone-500 text-sm">No class data available.</p>
      </div>
    );
  }

  const COLORS = ['#243b53', '#e63946', '#2a9d8f', '#e9c46a', '#e76f51', '#486581', '#9fb3c8'];

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={80}
          paddingAngle={5}
          dataKey="value"
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip 
          contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
        />
        <Legend verticalAlign="bottom" height={36} iconType="circle" />
      </PieChart>
    </ResponsiveContainer>
  );
}

export const ClassDistributionChart = dynamic(
  () => Promise.resolve(ClassDistributionChartInner),
  {
    ssr: false,
    loading: () => <div className="h-full w-full animate-pulse rounded-md bg-stone-100" />,
  }
);
