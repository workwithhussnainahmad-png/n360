"use client";

import dynamic from "next/dynamic";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

function ExamPerformanceChartInner({ data }: { data: { title: string, average: number }[] }) {
  if (!data || data.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <p className="text-stone-500 text-sm">No recent exam data available.</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 20, right: 30, left: -20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e5e4" />
        <XAxis 
          dataKey="title" 
          axisLine={false}
          tickLine={false}
          tick={{ fill: '#78716c', fontSize: 12 }}
          dy={10}
        />
        <YAxis 
          axisLine={false}
          tickLine={false}
          tick={{ fill: '#78716c', fontSize: 12 }}
          domain={[0, 100]}
        />
        <Tooltip 
          contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
          formatter={(value: any) => [`${Number(value).toFixed(1)}%`, 'Average']}
        />
        <Line 
          type="monotone" 
          dataKey="average" 
          stroke="#243b53" 
          strokeWidth={3}
          dot={{ r: 4, strokeWidth: 2, fill: "#fff" }}
          activeDot={{ r: 6, strokeWidth: 0, fill: "#e63946" }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export const ExamPerformanceChart = dynamic(
  () => Promise.resolve(ExamPerformanceChartInner),
  {
    ssr: false,
    loading: () => <div className="h-full w-full animate-pulse rounded-md bg-stone-100" />,
  }
);
