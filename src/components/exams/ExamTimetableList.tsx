import { BookOpen, CalendarDays, Clock, FileText, Trophy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type ExamTimetableRow = {
  id: number;
  title: string;
  type: string;
  date: string;
  endDate: string | null;
  maxMarks: number;
  className: string;
  subjectName: string | null;
};

function formatExamDate(value: string) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatDay(value: string) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: "long",
    timeZone: "UTC",
  });
}

function formatMonthDay(value: string) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function typeLabel(value: string) {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

function countSundays(start: string, end: string) {
  const current = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  let total = 0;

  while (current <= last) {
    if (current.getUTCDay() === 0) total += 1;
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return total;
}

function groupRows(rows: ExamTimetableRow[]) {
  return Array.from(
    rows.reduce((groups, row) => {
      const key = `${row.title}-${row.type}-${row.className}-${row.maxMarks}-${row.endDate || row.date}`;
      const existing = groups.get(key);
      if (existing) {
        existing.rows.push(row);
        existing.rows.sort((a, b) => a.date.localeCompare(b.date));
        if (row.date < existing.startDate) existing.startDate = row.date;
        if ((row.endDate || row.date) > existing.endDate) existing.endDate = row.endDate || row.date;
      } else {
        groups.set(key, {
          key,
          title: row.title,
          type: row.type,
          className: row.className,
          maxMarks: row.maxMarks,
          startDate: row.date,
          endDate: row.endDate || row.date,
          rows: [row],
        });
      }
      return groups;
    }, new Map<string, {
      key: string;
      title: string;
      type: string;
      className: string;
      maxMarks: number;
      startDate: string;
      endDate: string;
      rows: ExamTimetableRow[];
    }>())
      .values()
  );
}

interface ExamTimetableListProps {
  rows: ExamTimetableRow[];
  emptyText: string;
  audience?: "student" | "staff";
}

const TYPE_STYLES: Record<string, string> = {
  MONTHLY: "border-l-sky-600 bg-sky-50/80 text-sky-950",
  MID: "border-l-amber-600 bg-amber-50/80 text-amber-950",
  FINAL: "border-l-rose-600 bg-rose-50/80 text-rose-950",
};

export function ExamTimetableList({ rows, emptyText, audience = "student" }: ExamTimetableListProps) {
  const groups = groupRows(rows);
  const totalSubjects = rows.length;
  const nextExam = [...rows].sort((a, b) => a.date.localeCompare(b.date))[0];

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 sm:p-10 text-center">
          <CalendarDays className="mx-auto mb-3 h-10 w-10 text-stone-300" />
          <p className="text-sm text-stone-500">{emptyText}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-border bg-white p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase text-stone-500">
            <CalendarDays className="h-4 w-4 text-brand-700" />
            Published Exams
          </div>
          <p className="mt-2 text-2xl font-bold text-brand-950">{groups.length}</p>
        </div>
        <div className="rounded-md border border-border bg-white p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase text-stone-500">
            <BookOpen className="h-4 w-4 text-emerald-700" />
            Books Scheduled
          </div>
          <p className="mt-2 text-2xl font-bold text-brand-950">{totalSubjects}</p>
        </div>
        <div className="rounded-md border border-border bg-white p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase text-stone-500">
            <Clock className="h-4 w-4 text-amber-700" />
            Next Paper
          </div>
          <p className="mt-2 truncate text-lg font-bold text-brand-950">{nextExam?.subjectName || "Subject"}</p>
          <p className="text-xs text-stone-500">{nextExam ? formatExamDate(nextExam.date) : "-"}</p>
        </div>
      </div>

      {groups.map((group) => {
        const skippedSundays = countSundays(group.startDate, group.endDate);
        const style = TYPE_STYLES[group.type] || "border-l-brand-700 bg-brand-50/80 text-brand-950";
        return (
          <Card key={group.key} className="overflow-hidden">
            <CardHeader className={cn("border-b border-l-4 border-border p-0", style)}>
              <CardTitle className="grid gap-4 p-5 lg:grid-cols-[1fr_auto] lg:items-center">
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-bold uppercase tracking-wide">
                      {typeLabel(group.type)}
                    </span>
                    <span className="text-xs font-medium text-stone-600">{group.className}</span>
                  </div>
                  <h2 className="truncate text-xl font-bold">{group.title}</h2>
                  <p className="mt-1 text-sm font-medium text-stone-600">
                    {formatExamDate(group.startDate)} to {formatExamDate(group.endDate)}
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 rounded-md bg-white/80 p-3 text-center shadow-sm">
                  <div className="min-w-20">
                    <p className="text-lg font-bold text-brand-950">{group.rows.length}</p>
                    <p className="text-[11px] font-medium text-stone-500">Books</p>
                  </div>
                  <div className="min-w-20 border-x border-border px-2">
                    <p className="text-lg font-bold text-brand-950">{skippedSundays}</p>
                    <p className="text-[11px] font-medium text-stone-500">Sundays</p>
                  </div>
                  <div className="min-w-20">
                    <p className="text-lg font-bold text-brand-950">{group.maxMarks}</p>
                    <p className="text-[11px] font-medium text-stone-500">Marks</p>
                  </div>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="hidden lg:block">
                <div className="grid grid-cols-[140px_160px_1fr_120px_120px] border-b border-border bg-brand-950 px-5 py-3 text-xs font-bold uppercase tracking-wider text-brand-100">
                  <div>Date</div>
                  <div>Day</div>
                  <div>Book / Subject</div>
                  <div>{audience === "staff" ? "Class" : "Type"}</div>
                  <div className="text-right">Marks</div>
                </div>
                {group.rows.map((row) => (
                  <div key={row.id} className="grid grid-cols-[140px_160px_1fr_120px_120px] items-center border-b border-border px-5 py-4 last:border-b-0 odd:bg-white even:bg-stone-50/50">
                    <div>
                      <p className="font-mono text-sm font-bold text-brand-950">{formatMonthDay(row.date)}</p>
                      <p className="text-xs text-stone-500">{formatExamDate(row.date).split(",").pop()?.trim()}</p>
                    </div>
                    <p className="text-sm font-medium text-stone-700">{formatDay(row.date)}</p>
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white ring-1 ring-border">
                        <FileText className="h-4 w-4 text-brand-700" />
                      </div>
                      <p className="truncate font-semibold text-brand-950">{row.subjectName || "Subject"}</p>
                    </div>
                    <p className="text-sm text-stone-600">{audience === "staff" ? row.className : typeLabel(row.type)}</p>
                    <p className="text-right text-sm font-bold text-brand-950">{row.maxMarks}</p>
                  </div>
                ))}
              </div>

              <div className="divide-y divide-border lg:hidden">
                {group.rows.map((row) => (
                  <div key={row.id} className="grid grid-cols-[76px_1fr] gap-3 p-4">
                    <div className="rounded-md bg-brand-950 px-2 py-3 text-center text-white">
                      <p className="text-xs font-medium text-brand-200">{formatDay(row.date).slice(0, 3)}</p>
                      <p className="mt-1 text-lg font-bold">{formatMonthDay(row.date).split(" ")[1]}</p>
                      <p className="text-xs text-brand-100">{formatMonthDay(row.date).split(" ")[0]}</p>
                    </div>
                    <div className="min-w-0 rounded-md border border-border bg-white p-3">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <p className="truncate font-semibold text-brand-950">{row.subjectName || "Subject"}</p>
                        <span className="shrink-0 rounded bg-stone-100 px-2 py-1 text-xs text-stone-600">{row.maxMarks} marks</span>
                      </div>
                      <p className="text-xs text-stone-500">{formatExamDate(row.date)} - {typeLabel(row.type)}</p>
                      {audience === "staff" && <p className="mt-1 text-xs font-medium text-stone-600">{row.className}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}

      <div className="flex items-start gap-3 rounded-md border border-border bg-stone-50 p-4 text-sm text-stone-600">
        <Trophy className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" />
        <p>Sundays are skipped by the institution schedule, so the end date may move forward when a Sunday falls between papers.</p>
      </div>
    </div>
  );
}
