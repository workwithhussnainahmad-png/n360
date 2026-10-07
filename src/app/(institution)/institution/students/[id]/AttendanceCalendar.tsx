"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

type AttendanceRecord = {
  id: number;
  date: string; // YYYY-MM-DD
  status: "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";
};

const STATUS_COLORS = {
  PRESENT: "bg-emerald-100 text-emerald-700 border-emerald-200",
  ABSENT: "bg-red-100 text-red-700 border-red-200",
  LATE: "bg-amber-100 text-amber-700 border-amber-200",
  EXCUSED: "bg-blue-100 text-blue-700 border-blue-200",
};

export function AttendanceCalendar({
  records,
  monthValue,
  onMonthChange,
}: {
  records: AttendanceRecord[];
  monthValue: string;
  onMonthChange: (month: string) => void;
}) {
  const currentDate = new Date(`${monthValue}-01T00:00:00`);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay();

  const changeMonth = (offset: number) => {
    const next = new Date(year, month + offset, 1);
    onMonthChange(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`);
  };

  const monthName = currentDate.toLocaleString("default", { month: "long" });

  const getDayStatus = (day: number) => {
    // Format to YYYY-MM-DD local time safely
    const d = new Date(year, month, day);
    const dateStr = [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, "0"),
      String(d.getDate()).padStart(2, "0"),
    ].join("-");

    return records.find((r) => r.date === dateStr)?.status;
  };

  const days = [];
  for (let i = 0; i < firstDayOfMonth; i++) {
    days.push(<div key={`empty-${i}`} className="h-10 w-full" />);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const status = getDayStatus(d);
    days.push(
      <div
        key={`day-${d}`}
        className={`h-10 w-full flex items-center justify-center rounded-md border text-sm font-medium transition-colors ${
          status ? STATUS_COLORS[status as keyof typeof STATUS_COLORS] : "bg-stone-50 border-transparent text-stone-400"
        }`}
        title={status ? `${status} on ${monthName} ${d}` : `No record for ${monthName} ${d}`}
      >
        {d}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-stone-800">
          {monthName} {year}
        </h3>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => changeMonth(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => changeMonth(1)} disabled={new Date().getMonth() === month && new Date().getFullYear() === year}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      <div className="grid grid-cols-7 gap-2 text-center text-xs font-semibold text-stone-500 mb-2">
        <div>Su</div>
        <div>Mo</div>
        <div>Tu</div>
        <div>We</div>
        <div>Th</div>
        <div>Fr</div>
        <div>Sa</div>
      </div>
      
      <div className="grid grid-cols-7 gap-2">
        {days}
      </div>

      <div className="flex gap-4 text-xs font-medium text-stone-500 pt-4 border-t border-border mt-4 justify-center">
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-emerald-100 border border-emerald-200"></div> Present</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-red-100 border border-red-200"></div> Absent</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-amber-100 border border-amber-200"></div> Late</div>
      </div>
    </div>
  );
}
