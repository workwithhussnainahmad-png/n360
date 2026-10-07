"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Activity, CalendarDays, FileCheck } from "lucide-react";

type RecordData = {
  attendances: { date: string; status: string }[];
  marks: { date: string; marksObtained: number; totalMarks: number }[];
  submissions: { createdAt: string }[];
};

type ChartMonth = {
  name: string;
  key: string;
  totalDays: number;
  presentDays: number;
  marksAvg: number;
  testsCount: number;
  marksPercentage: number;
  submissionsCount: number;
};

export function StudentAnalytics({ data, month }: { data: RecordData; month: string }) {
  const chartData = useMemo(() => {
    const monthDate = new Date(`${month}-01T00:00:00`);
    const monthsMap: Record<string, ChartMonth> = {
      [month]: {
        name: monthDate.toLocaleString("default", { month: "short", year: "2-digit" }),
        key: month,
        totalDays: 0,
        presentDays: 0,
        marksAvg: 0,
        testsCount: 0,
        marksPercentage: 0,
        submissionsCount: 0,
      },
    };

    data.attendances.forEach((a) => {
      const key = a.date.substring(0, 7); // YYYY-MM
      if (monthsMap[key]) {
        monthsMap[key].totalDays++;
        if (a.status === "PRESENT" || a.status === "LATE") {
          monthsMap[key].presentDays++;
        }
      }
    });

    data.marks.forEach((m) => {
      const key = m.date.substring(0, 7);
      if (monthsMap[key] && m.totalMarks > 0) {
        monthsMap[key].testsCount++;
        monthsMap[key].marksAvg += (m.marksObtained / m.totalMarks) * 100;
      }
    });

    data.submissions.forEach((s) => {
      const key = s.createdAt.substring(0, 7);
      if (monthsMap[key]) {
        monthsMap[key].submissionsCount++;
      }
    });

    return Object.values(monthsMap).map((m) => ({
      name: m.name,
      attendanceRate: m.totalDays > 0 ? Math.round((m.presentDays / m.totalDays) * 100) : 0,
      marksAvg: m.testsCount > 0 ? Math.round(m.marksAvg / m.testsCount) : 0,
      submissions: m.submissionsCount,
    }));
  }, [data, month]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-6 print:hidden">
      {/* Attendance Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2 text-stone-600">
            <CalendarDays className="h-4 w-4 text-emerald-500" /> Attendance Rate (%)
          </CardTitle>
        </CardHeader>
        <CardContent className="h-[200px] w-full px-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#6b7280" }} />
              <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#6b7280" }} />
              <Tooltip cursor={{ fill: "#f3f4f6" }} contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }} />
              <Bar dataKey="attendanceRate" name="Attendance %" fill="#10b981" radius={[4, 4, 0, 0]} barSize={32} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Marks Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2 text-stone-600">
            <Activity className="h-4 w-4 text-blue-500" /> Avg. Test Score (%)
          </CardTitle>
        </CardHeader>
        <CardContent className="h-[200px] w-full px-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#6b7280" }} />
              <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#6b7280" }} />
              <Tooltip contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }} />
              <Line type="monotone" dataKey="marksAvg" name="Score %" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Submissions Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2 text-stone-600">
            <FileCheck className="h-4 w-4 text-purple-500" /> Submissions Count
          </CardTitle>
        </CardHeader>
        <CardContent className="h-[200px] w-full px-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#6b7280" }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#6b7280" }} allowDecimals={false} />
              <Tooltip cursor={{ fill: "#f3f4f6" }} contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }} />
              <Bar dataKey="submissions" name="Assignments" fill="#a855f7" radius={[4, 4, 0, 0]} barSize={32} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
