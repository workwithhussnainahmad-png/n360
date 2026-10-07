"use client";

import dynamic from "next/dynamic";

type TrendData = {
  date: string;
  PRESENT: number;
  ABSENT: number;
  LEAVE: number;
  LATE: number;
};

const AttendanceTrendsChart = dynamic(
  () => import("./AttendanceTrendsChart").then((module) => module.AttendanceTrendsChart),
  {
    ssr: false,
    loading: () => (
      <div className="h-full w-full animate-pulse rounded-md bg-stone-100" aria-label="Loading attendance chart" />
    ),
  }
);

export function AttendanceTrendsChartDeferred({ data }: { data: TrendData[] }) {
  return <AttendanceTrendsChart data={data} />;
}
