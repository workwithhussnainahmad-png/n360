import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { db } from "@/db";
import { attendances, sections, students } from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { eq, and, desc, inArray, gte, sql } from "drizzle-orm";
import { staffAssignments, classes } from "@/db/schema";
import { getCachedOrFetch } from "@/lib/redis";

async function getAssignedSections(staffId: number, institutionId: number) {
  // Only fetch sections where this staff member is explicitly set as the class incharge
  return db.selectDistinct({
    id: sections.id,
    name: sections.name,
    classId: sections.classId,
    className: classes.name,
  })
    .from(sections)
    .innerJoin(classes, eq(sections.classId, classes.id))
    .where(and(eq(sections.classTeacherId, staffId), eq(sections.institutionId, institutionId)));
}

export const GET = requireRole(["STAFF"], async (req: NextRequest, { session }) => {
  if (!session.institutionId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const institutionId = session.institutionId;
    const staffId = session.userId;
    const view = req.nextUrl.searchParams.get("view") === "history" ? "history" : "mark";
    const sectionIdParam = req.nextUrl.searchParams.get("sectionId");
    const sectionId = sectionIdParam ? Number(sectionIdParam) : null;
    if (sectionIdParam && (!Number.isInteger(sectionId) || sectionId! <= 0)) {
      return NextResponse.json({ error: "Invalid sectionId" }, { status: 400 });
    }

    if (view === "mark") {
      const cacheKey = `cache:staff:attendance:mark:${institutionId}:${staffId}:${sectionId ?? "auto"}`;
      const data = await getCachedOrFetch(cacheKey, 30, async () => {
        const assignedSections = await getAssignedSections(staffId, institutionId);
        const targetSectionId = sectionId ?? assignedSections[0]?.id ?? null;

        if (!targetSectionId || !assignedSections.some((s) => s.id === targetSectionId)) {
          return { assignedSections, selectedSectionId: null, students: [], alreadyMarkedToday: false };
        }

        const todayStr = new Date().toISOString().split("T")[0];
        const [sectionStudents, todayRecords] = await Promise.all([
          db.select({
            id: students.id,
            name: students.name,
            loginRollNumber: students.loginRollNumber,
            sectionId: students.sectionId,
          })
            .from(students)
            .where(and(eq(students.institutionId, institutionId), eq(students.sectionId, targetSectionId))),
          db.select({ id: attendances.id })
            .from(attendances)
            .where(and(
              eq(attendances.institutionId, institutionId),
              eq(attendances.sectionId, targetSectionId),
              eq(attendances.date, todayStr),
            ))
            .limit(1),
        ]);

        return {
          assignedSections,
          selectedSectionId: targetSectionId,
          students: sectionStudents,
          alreadyMarkedToday: todayRecords.length > 0,
        };
      });

      return NextResponse.json(data);
    }

    // view === "history"
    const dateParam = req.nextUrl.searchParams.get("date");
    const isValidDate = typeof dateParam === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateParam);
    if (dateParam && !isValidDate) {
      return NextResponse.json({ error: "Invalid date. Use YYYY-MM-DD." }, { status: 400 });
    }

    const cacheKey = isValidDate
      ? `cache:staff:attendance:history:${institutionId}:${staffId}:${dateParam}:${sectionId ?? "all"}`
      : `cache:staff:attendance:history:${institutionId}:${staffId}:${sectionId ?? "all"}`;

    const cachedData = await getCachedOrFetch(cacheKey, 30, async () => {
      const assignedSections = await getAssignedSections(staffId, institutionId);
      const sectionIds = sectionId
        ? assignedSections.filter((s) => s.id === sectionId).map((s) => s.id)
        : assignedSections.map((s) => s.id);

      let classAttendance: any[] = [];
      if (sectionIds.length > 0) {
        // When a specific date is requested, filter to that date only; otherwise
        // limit to last 30 days to prevent unbounded response growth.
        const dateFilter = isValidDate
          ? eq(attendances.date, dateParam!)
          : gte(attendances.date, (() => {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            return thirtyDaysAgo.toISOString().split('T')[0];
          })());

        classAttendance = await db
          .select({
            id: attendances.id,
            date: attendances.date,
            status: attendances.status,
            studentName: students.name,
            sectionId: attendances.sectionId,
            sectionName: sections.name,
          })
          .from(attendances)
          .innerJoin(students, eq(attendances.studentId, students.id))
          .innerJoin(sections, eq(attendances.sectionId, sections.id))
          .where(
            and(
              inArray(attendances.sectionId, sectionIds),
              eq(attendances.institutionId, institutionId),
              dateFilter
            )
          )
          .orderBy(desc(attendances.date));
      }

      return { attendance: classAttendance };
    });

    return NextResponse.json(cachedData);
  } catch (error) {
    console.error("Error fetching staff attendance overview:", error);
    return NextResponse.json({ error: "Failed to fetch attendance" }, { status: 500 });
  }
});

export const POST = requireRole(["STAFF"], async (req: NextRequest, { session }) => {
  if (!session.institutionId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { sectionId, date, records } = body as {
      sectionId: number;
      date: string;
      records: { studentId: number; status: "PRESENT" | "ABSENT" | "LATE" | "LEAVE" }[];
    };

    if (!sectionId || !date || !records || !Array.isArray(records)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    // Authorization: only the class incharge can mark attendance
    const [section] = await db.select({ classTeacherId: sections.classTeacherId })
      .from(sections)
      .where(and(eq(sections.id, sectionId), eq(sections.institutionId, session.institutionId)));

    if (!section || section.classTeacherId !== session.userId) {
      return NextResponse.json({ error: "You are not authorized to mark attendance for this class. Only the designated Class Incharge can do this." }, { status: 403 });
    }

    // Bulk upsert attendance — single query instead of N sequential round-trips
    await db.insert(attendances)
      .values(records.map(record => ({
        institutionId: session.institutionId!,
        sectionId,
        studentId: record.studentId,
        date: date.split("T")[0],
        status: record.status,
      })))
      .onConflictDoUpdate({
        target: [attendances.studentId, attendances.date],
        set: { status: sql`excluded.status` },
      });

    const { invalidateStudentAttendanceCaches } = await import('@/lib/redis');
    await invalidateStudentAttendanceCaches(session.institutionId!, records.map(record => record.studentId));
    const { createAttendanceNotifications } = await import("@/lib/notifications");
    after(async () => {
      try {
        await createAttendanceNotifications({
          institutionId: session.institutionId!,
          date,
          records,
        });


      } catch (e) {
        console.error(e);
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error submitting attendance:", error);
    return NextResponse.json({ error: "Failed to submit attendance" }, { status: 500 });
  }
});
