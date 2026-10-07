import Link from "next/link";
import { and, asc, eq, isNull } from "drizzle-orm";
import { ArrowLeft, CalendarDays } from "lucide-react";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { db } from "@/db";
import { classes, sections, staff, staffAssignments, subjects } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { PrintButton } from "./PrintButton";

const WHOLE_CLASS_SECTION_NAME = "Whole Class";

const SHORT_DAYS: Record<number, string> = {
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
  7: "Sun",
};

function formatDays(days: number[]) {
  if (!days || days.length === 0) return "";
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  if (sorted.length === 6 && sorted[0] === 1 && sorted[5] === 6) return ""; // All days Mon-Sat
  if (sorted.length === 7 && sorted[0] === 1 && sorted[6] === 7) return ""; // All week
  
  let isConsecutive = true;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] !== sorted[i - 1] + 1) isConsecutive = false;
  }
  if (isConsecutive && sorted.length >= 3) {
    return `${SHORT_DAYS[sorted[0]]}-${SHORT_DAYS[sorted[sorted.length - 1]]}`;
  }
  return sorted.map(d => SHORT_DAYS[d]).join(", ");
}

function timeLabel(value: string) {
  return value.substring(0, 5);
}

type CellData = {
  subjectName: string | null;
  teacherName: string | null;
  isBreak: boolean;
  sectionName: string | null;
  days: number[];
};

export default async function InstitutionTimetableOverviewPage() {
  const session = await getSession();
  if (!session || (session.role !== "INSTITUTION" && session.role !== "INSTITUTION_ADMIN")) {
    redirect("/login");
  }

  const institutionId = session.institutionId || session.userId;

  const [institutionClasses, scheduleRows] = await Promise.all([
    db
      .select({ id: classes.id, name: classes.name, level: classes.level })
      .from(classes)
      .where(and(eq(classes.institutionId, institutionId), isNull(classes.deletedAt)))
      .orderBy(asc(classes.level), asc(classes.name)),
    db
      .select({
        classId: sections.classId,
        sectionName: sections.name,
        dayOfWeek: staffAssignments.dayOfWeek,
        startTime: staffAssignments.startTime,
        endTime: staffAssignments.endTime,
        isBreak: staffAssignments.isBreak,
        subjectName: subjects.name,
        teacherName: staff.name,
      })
      .from(staffAssignments)
      .innerJoin(
        sections,
        and(
          eq(staffAssignments.sectionId, sections.id),
          eq(sections.institutionId, institutionId),
          isNull(sections.deletedAt)
        )
      )
      .innerJoin(
        classes,
        and(
          eq(sections.classId, classes.id),
          eq(classes.institutionId, institutionId),
          isNull(classes.deletedAt)
        )
      )
      .leftJoin(
        subjects,
        and(
          eq(staffAssignments.subjectId, subjects.id),
          eq(subjects.institutionId, institutionId),
          isNull(subjects.deletedAt)
        )
      )
      .leftJoin(
        staff,
        and(
          eq(staffAssignments.staffId, staff.id),
          eq(staff.institutionId, institutionId),
          isNull(staff.deletedAt)
        )
      )
      .where(eq(staffAssignments.institutionId, institutionId))
      .orderBy(asc(classes.level), asc(classes.name), asc(staffAssignments.startTime)),
  ]);

  // Unique time slots for the week
  const slotMap = new Map<string, { startTime: string; endTime: string }>();
  for (const row of scheduleRows) {
    const key = `${row.startTime}-${row.endTime}`;
    if (!slotMap.has(key)) slotMap.set(key, { startTime: row.startTime, endTime: row.endTime });
  }
  const timeSlots = Array.from(slotMap.values()).sort((a, b) =>
    a.startTime.localeCompare(b.startTime)
  );

  // classId -> slotKey -> Array of grouped cells
  const cellMap = new Map<number, Map<string, CellData[]>>();
  for (const row of scheduleRows) {
    const slotKey = `${row.startTime}-${row.endTime}`;
    if (!cellMap.has(row.classId)) cellMap.set(row.classId, new Map());
    const classSlots = cellMap.get(row.classId)!;
    if (!classSlots.has(slotKey)) classSlots.set(slotKey, []);
    
    const existingGroups = classSlots.get(slotKey)!;
    const secName = row.sectionName === WHOLE_CLASS_SECTION_NAME ? null : row.sectionName;
    
    // Find if we already have a group for this exact subject/teacher/section/isBreak
    let group = existingGroups.find(g => 
      g.subjectName === row.subjectName && 
      g.teacherName === row.teacherName && 
      g.sectionName === secName && 
      g.isBreak === row.isBreak
    );
    
    if (group) {
      if (!group.days.includes(row.dayOfWeek)) {
        group.days.push(row.dayOfWeek);
      }
    } else {
      existingGroups.push({
        subjectName: row.subjectName,
        teacherName: row.teacherName,
        isBreak: row.isBreak,
        sectionName: secName,
        days: [row.dayOfWeek]
      });
    }
  }

  return (
    <div className="space-y-6 animate-fade-in print-document">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between print:hidden">
        <div>
          <Link
            href="/institution/timetable"
            className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-brand-700 hover:text-brand-950"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to timetable manager
          </Link>
          <div className="flex items-center gap-4">
            <h1 className="text-3xl font-display font-bold text-brand-950">
              Institution Timetable Overview
            </h1>
            <PrintButton />
          </div>
          <p className="mt-1 text-stone-500">
            Weekly Schedule &mdash; {institutionClasses.length}{" "}
            {institutionClasses.length === 1 ? "class" : "classes"}, {timeSlots.length}{" "}
            {timeSlots.length === 1 ? "period" : "periods"}
          </p>
        </div>
      </div>

      {institutionClasses.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="font-semibold text-brand-950">No classes yet</p>
            <p className="mt-2 text-sm text-stone-500">
              Create classes in Academics to start building the institution timetable.
            </p>
          </CardContent>
        </Card>
      ) : timeSlots.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-50">
              <CalendarDays className="h-7 w-7 text-brand-500" />
            </div>
            <h3 className="text-lg font-bold text-brand-950">No periods scheduled</h3>
            <p className="mt-2 max-w-md text-sm text-stone-500">
              No timetable entries found for this institution. Assign periods in the timetable manager.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-brand-950 text-white">
                    <th className="sticky left-0 z-10 bg-brand-950 px-4 py-3 text-left text-xs font-bold uppercase tracking-wider whitespace-nowrap border-r border-white/10">
                      Class
                    </th>
                    {timeSlots.map((slot, i) => (
                      <th
                        key={`${slot.startTime}-${slot.endTime}`}
                        className="px-3 py-3 text-center text-xs font-bold border-r border-white/10 last:border-r-0 whitespace-nowrap"
                      >
                        <div className="uppercase tracking-wider">Lecture {i + 1}</div>
                        <div className="mt-0.5 font-normal text-brand-200">
                          {timeLabel(slot.startTime)}-{timeLabel(slot.endTime)}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {institutionClasses.map((classRow, rowIdx) => {
                    const classSlots = cellMap.get(classRow.id);
                    return (
                      <tr
                        key={classRow.id}
                        className={rowIdx % 2 === 0 ? "bg-white" : "bg-stone-50/60"}
                      >
                        <td className="sticky left-0 z-10 px-4 py-3 font-semibold text-brand-950 whitespace-nowrap border-r border-border bg-inherit">
                          {classRow.name}
                        </td>
                        {timeSlots.map((slot) => {
                          const slotKey = `${slot.startTime}-${slot.endTime}`;
                          const cells = classSlots?.get(slotKey);

                          if (!cells || cells.length === 0) {
                            return (
                              <td
                                key={slotKey}
                                className="px-3 py-3 text-center text-xs text-stone-300 border-r border-border last:border-r-0"
                              >
                                &mdash;
                              </td>
                            );
                          }

                          // If any cell in this block is a break, render break for all
                          if (cells.some((c) => c.isBreak)) {
                            return (
                              <td
                                key={slotKey}
                                className="px-3 py-3 text-center text-xs italic text-stone-500 bg-stone-100/60 border-r border-border last:border-r-0"
                              >
                                Break
                              </td>
                            );
                          }

                          return (
                            <td
                              key={slotKey}
                              className="px-3 py-2 border-r border-border last:border-r-0 align-top"
                            >
                              <div className="space-y-2">
                                {cells.map((cell, ci) => {
                                  const dayStr = formatDays(cell.days);
                                  return (
                                    <div key={ci} className="border-l-2 border-brand-300 pl-2">
                                      <p className="font-semibold text-brand-950 leading-tight">
                                        {cell.subjectName || "—"}
                                      </p>
                                      {cell.teacherName && (
                                        <p className="text-xs text-stone-500 leading-tight">
                                          {cell.teacherName}
                                        </p>
                                      )}
                                      <div className="flex flex-wrap gap-1 mt-1">
                                        {cell.sectionName && (
                                          <span className="text-[9px] uppercase tracking-wide font-medium bg-stone-100 text-stone-500 px-1 py-0.5 rounded leading-tight">
                                            {cell.sectionName}
                                          </span>
                                        )}
                                        {dayStr && (
                                          <span className="text-[9px] uppercase tracking-wide font-medium bg-brand-50 text-brand-700 px-1 py-0.5 rounded leading-tight">
                                            {dayStr}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
