"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

type TrendData = {
  date: string;
  PRESENT: number;
  ABSENT: number;
  LEAVE: number;
  LATE: number;
};

export function AttendanceTrendsChart({ data }: { data: TrendData[] }) {
  const hasData = data && data.some(d => d.PRESENT > 0 || d.ABSENT > 0 || d.LEAVE > 0 || d.LATE > 0);

  if (!hasData) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <p className="text-stone-500 text-sm">No attendance data available for the last 7 days.</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={data}
        margin={{
          top: 20,
          right: 30,
          left: 0,
          bottom: 5,
        }}
      >
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e5e4" />
        <XAxis 
          dataKey="date" 
          axisLine={false}
          tickLine={false}
          tick={{ fill: '#78716c', fontSize: 12 }}
          dy={10}
        />
        <YAxis 
          axisLine={false}
          tickLine={false}
          tick={{ fill: '#78716c', fontSize: 12 }}
        />
        <Tooltip 
          cursor={{ fill: '#f5f5f4' }}
          contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
        />
        <Legend wrapperStyle={{ paddingTop: '20px' }} iconType="circle" />
        <Bar dataKey="PRESENT" stackId="a" fill="#10b981" name="Present" />
        <Bar dataKey="LATE" stackId="a" fill="#f59e0b" name="Late" />
        <Bar dataKey="LEAVE" stackId="a" fill="#6366f1" name="Leave" />
        <Bar dataKey="ABSENT" stackId="a" fill="#ef4444" name="Absent" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
