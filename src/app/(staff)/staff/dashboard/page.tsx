import { Card, CardContent } from "@/components/ui/card";
import { CheckSquare, ChevronRight, FileEdit, Zap } from "lucide-react";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { staffAssignments, sections, classes, subjects, staff } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getVisibleAnnouncements } from "@/lib/announcements";
import { DashboardAnnouncements } from "@/components/announcements/DashboardAnnouncements";
import { TodayTimetableCard, type TimetableEntry } from "@/components/timetable/ScheduleViews";
import { getCachedOrFetch } from "@/lib/redis";
import { formatClassSection } from "@/lib/class-section-label";

import { StaffLeaveRequestButton } from "./StaffLeaveRequestButton";

/**
 * Staff dashboard — today's timetable + announcements only (visible above the fold).
 *
 * Cache key: cache:staff:dashboard:web:{instId}:{staffId}:{day}
 * Scope: staff + institution + weekday
 * TTL: 45s
 * Invalidation: timetable mutations should delete this key family (TTL covers misses)
 * Acceptable staleness: ~45s
 * Fallback: Valkey miss → Postgres
 */
export default async function StaffDashboard() {
  const session = await getSession();
  if (!session || session.role !== "STAFF") {
    redirect("/login");
  }

  const staffId = session.userId;
  if (!session.institutionId) redirect("/login");
  const institutionId = session.institutionId;
  const currentDay = new Date().getDay();

  const [payload, recentAnnouncements] = await Promise.all([
    getCachedOrFetch(`cache:staff:dashboard:web:${institutionId}:${staffId}:${currentDay}`, 45, async () => {
      const [staffRows, scheduleRows] = await Promise.all([
        db
          .select({ name: staff.name })
          .from(staff)
          .where(and(eq(staff.id, staffId), eq(staff.institutionId, institutionId)))
          .limit(1),
        db
          .select({
            id: staffAssignments.id,
            startTime: staffAssignments.startTime,
            endTime: staffAssignments.endTime,
            subject: subjects.name,
            className: classes.name,
            sectionName: sections.name,
          })
          .from(staffAssignments)
          .innerJoin(subjects, eq(staffAssignments.subjectId, subjects.id))
          .innerJoin(sections, eq(staffAssignments.sectionId, sections.id))
          .innerJoin(classes, eq(sections.classId, classes.id))
          .where(
            and(
              eq(staffAssignments.staffId, staffId),
              eq(staffAssignments.institutionId, institutionId),
              eq(staffAssignments.dayOfWeek, currentDay)
            )
          ),
      ]);

      const sorted = [...scheduleRows].sort((a, b) => a.startTime.localeCompare(b.startTime));
      return {
        name: staffRows[0]?.name || "Staff",
        scheduleRows: sorted,
      };
    }),
    getVisibleAnnouncements(session, 4),
  ]);

  const todayEntries: TimetableEntry[] = payload.scheduleRows.map((row) => ({
    id: row.id,
    dayOfWeek: currentDay,
    startTime: row.startTime,
    endTime: row.endTime,
    title: row.subject || "Subject",
    meta: formatClassSection(row.className, row.sectionName),
  }));

  return (
    <div className="space-y-6 animate-fade-in pb-20 lg:pb-0">
      <div>
        <h1 className="font-display text-3xl font-bold text-brand-950">Welcome, {payload.name}</h1>
        <p className="text-stone-500 mt-1 text-sm lg:text-base">Here is your schedule for today.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <TodayTimetableCard entries={todayEntries} title="Today's Teaching Timetable" />
        </div>

        <div className="space-y-4 mt-8 lg:mt-0">
          <Card className="overflow-hidden border-stone-200/80 shadow-sm">
            <div className="border-b border-stone-100 bg-stone-50/70 px-5 py-4">
              <div className="flex items-center gap-2 text-brand-900">
                <Zap className="h-4 w-4" aria-hidden="true" />
                <h2 className="font-display text-lg font-semibold">Quick actions</h2>
              </div>
              <p className="mt-1 text-sm leading-5 text-stone-500">Your most-used teaching tasks.</p>
            </div>
            <CardContent className="space-y-2 p-3">
              <Link
                href="/staff/attendance"
                prefetch={false}
                className="group flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-3 text-left transition-colors hover:border-brand-100 hover:bg-brand-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-950 text-white shadow-sm">
                  <CheckSquare className="h-5 w-5" aria-hidden="true" />
                </div>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-brand-950">Mark attendance</span>
                  <span className="block truncate text-xs text-stone-500">Record today&apos;s class attendance</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-stone-400 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-700" aria-hidden="true" />
              </Link>
              <Link
                href="/staff/marks"
                prefetch={false}
                className="group flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-3 text-left transition-colors hover:border-brand-100 hover:bg-brand-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-lime-200 text-brand-950">
                  <FileEdit className="h-5 w-5" aria-hidden="true" />
                </div>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-brand-950">Enter marks</span>
                  <span className="block truncate text-xs text-stone-500">Update student exam results</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-stone-400 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-700" aria-hidden="true" />
              </Link>
              <StaffLeaveRequestButton />
            </CardContent>
          </Card>
          <DashboardAnnouncements announcements={recentAnnouncements} />
        </div>
      </div>
    </div>
  );
}
