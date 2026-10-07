"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AttendanceTrendsChartDeferred } from "./AttendanceTrendsChartDeferred";
import { ClassDistributionChart } from "./ClassDistributionChart";
import { ExamPerformanceChart } from "./ExamPerformanceChart";

type TrendData = { date: string; PRESENT: number; ABSENT: number; LEAVE: number; LATE: number };
type ClassDistPoint = { name: string; value: number };
type ExamPerfPoint = { title: string; average: number };

type ChartsData = {
  attendanceTrends: TrendData[];
  classDistribution: ClassDistPoint[];
  examPerformance: ExamPerfPoint[];
};

type ChartsContextValue = {
  data: ChartsData | null;
  loading: boolean;
};

const ChartsContext = createContext<ChartsContextValue>({ data: null, loading: true });

/**
 * Charts are part of the visible dashboard composition, but we defer the network
 * request until the chart region is near the viewport to avoid competing with
 * above-the-fold RSC stats. AbortController prevents Strict Mode double-fetch.
 */
export function DashboardChartsProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<ChartsData | null>(null);
  const [loading, setLoading] = useState(true);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;

    let ignore = false;
    const controller = new AbortController();

    const load = () => {
      if (startedRef.current) return;
      startedRef.current = true;
      fetch("/api/institution/dashboard/charts", { signal: controller.signal })
        .then((res) => (res.ok ? res.json() : null))
        .then((json: ChartsData | null) => {
          if (!ignore && json) setData(json);
        })
        .catch(() => {})
        .finally(() => {
          if (!ignore) setLoading(false);
        });
    };

    if (typeof IntersectionObserver === "undefined") {
      load();
      return () => {
        ignore = true;
        controller.abort();
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          observer.disconnect();
          load();
        }
      },
      { rootMargin: "200px 0px" }
    );
    observer.observe(node);

    return () => {
      ignore = true;
      controller.abort();
      observer.disconnect();
    };
  }, []);

  return (
    <div ref={rootRef}>
      <ChartsContext.Provider value={{ data, loading }}>{children}</ChartsContext.Provider>
    </div>
  );
}

function ChartSkeleton() {
  return <div className="h-full w-full animate-pulse rounded-md bg-stone-100" aria-hidden="true" />;
}

export function AttendanceTrendsCard() {
  const { data, loading } = useContext(ChartsContext);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Attendance Trends</CardTitle>
      </CardHeader>
      <CardContent className="h-[250px] sm:h-[300px] mt-4 p-0 pb-4">
        {loading || !data ? <ChartSkeleton /> : <AttendanceTrendsChartDeferred data={data.attendanceTrends} />}
      </CardContent>
    </Card>
  );
}

export function ExamPerformanceCard() {
  const { data, loading } = useContext(ChartsContext);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Exam Performance</CardTitle>
      </CardHeader>
      <CardContent className="h-[250px] sm:h-[300px] mt-4 p-0 pb-4">
        {loading || !data ? <ChartSkeleton /> : <ExamPerformanceChart data={data.examPerformance} />}
      </CardContent>
    </Card>
  );
}

export function ClassDistributionCard() {
  const { data, loading } = useContext(ChartsContext);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Class Distribution</CardTitle>
      </CardHeader>
      <CardContent className="h-[250px] sm:h-[300px] mt-4 p-0 pb-4">
        {loading || !data ? <ChartSkeleton /> : <ClassDistributionChart data={data.classDistribution} />}
      </CardContent>
    </Card>
  );
}
