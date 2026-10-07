import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { announcements, classes, institutionHolidays, subjects, tests } from "@/db/schema";
import { getTenantContext, requireRole } from "@/lib/rbac";

const INSTITUTION_EXAM_TYPES = new Set(["MONTHLY", "MID", "FINAL", "PROMOTION"]);

function parseLocalDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, (month || 1) - 1, day || 1));
}

function formatLocalDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function isExamOffDay(value: Date, holidays: Set<string>) {
  return value.getUTCDay() === 0 || holidays.has(formatLocalDate(value));
}

function nextExamDate(value: Date, holidays: Set<string>) {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + 1);
  while (isExamOffDay(next, holidays)) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

function buildExamDates(startDate: string, count: number, holidays: Set<string>) {
  let current = parseLocalDate(startDate);
  while (isExamOffDay(current, holidays)) current = nextExamDate(current, holidays);

  const dates: string[] = [];
  for (let index = 0; index < count; index++) {
    dates.push(formatLocalDate(current));
    if (index < count - 1) current = nextExamDate(current, holidays);
  }

  return {
    dates,
    startDate: dates[0],
    endDate: dates[dates.length - 1],
  };
}

async function getInstitutionHolidaySet(institutionId: number) {
  const rows = await db.select({ date: institutionHolidays.date })
    .from(institutionHolidays)
    .where(eq(institutionHolidays.institutionId, institutionId));
  return new Set(rows.map((row) => row.date));
}

async function requireInstitutionClass(institutionId: number, classId: number) {
  const [classRow] = await db.select().from(classes)
    .where(and(eq(classes.id, classId), eq(classes.institutionId, institutionId)))
    .limit(1);
  if (!classRow) throw new Error("Invalid class");
  return classRow;
}

async function requireInstitutionSubjects(institutionId: number, subjectIds: number[]) {
  const uniqueSubjectIds = Array.from(new Set(subjectIds));
  const rows = await db.select().from(subjects)
    .where(and(eq(subjects.institutionId, institutionId), inArray(subjects.id, uniqueSubjectIds)));
  if (rows.length !== uniqueSubjectIds.length) {
    throw new Error("One or more subjects do not belong to this institution");
  }
  return uniqueSubjectIds;
}

async function createExamAnnouncement(
  institutionId: number,
  classId: number,
  title: string,
  type: string,
  startDate: string,
  endDate: string,
  subjectCount: number,
  status: "created" | "updated" | "cancelled"
) {
  const [classRow] = await db.select({ name: classes.name }).from(classes)
    .where(and(eq(classes.id, classId), eq(classes.institutionId, institutionId)))
    .limit(1);
  const label = type.charAt(0) + type.slice(1).toLowerCase();
  const action = status === "created" ? "scheduled" : status === "updated" ? "updated" : "cancelled";

  const [insertedAnnouncement] = await db.insert(announcements).values({
    institutionId,
    senderRole: "INSTITUTION",
    senderId: institutionId,
    targetType: "CLASS",
    targetClassId: classId,
    title: `${label} exam ${action}: ${title}`,
    content: status === "cancelled"
      ? `${title} for ${classRow?.name || "this class"} has been cancelled.`
      : `${title} for ${classRow?.name || "this class"} has been ${action}. Exam dates run from ${startDate} to ${endDate} for ${subjectCount} book${subjectCount === 1 ? "" : "s"}. Sundays are skipped in the timetable.`,
  }).returning({ id: announcements.id });

  const { processAnnouncementNotification } = await import("@/lib/notifications");
  await processAnnouncementNotification(insertedAnnouncement.id);
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

export const GET = requireRole(["INSTITUTION", "INSTITUTION_ADMIN"], async (_req: NextRequest, { session }) => {
  const institutionId = getTenantContext(session);

  const examRows = await db.select({
    id: tests.id,
    title: tests.title,
    type: tests.type,
    date: tests.date,
    endDate: tests.endDate,
    maxMarks: tests.maxMarks,
    classId: tests.classId,
    subjectId: tests.subjectId,
    className: classes.name,
    subjectName: subjects.name,
  })
    .from(tests)
    .innerJoin(classes, eq(tests.classId, classes.id))
    .innerJoin(subjects, eq(tests.subjectId, subjects.id))
    .where(and(
      eq(tests.institutionId, institutionId),
      eq(tests.createdByRole, "INSTITUTION"),
      inArray(tests.type, ["MONTHLY", "MID", "FINAL", "PROMOTION"])
    ))
    .orderBy(desc(tests.createdAt));

  const examGroups = Array.from(
    examRows.reduce((groups, exam) => {
      const key = `${exam.title}-${exam.type}-${exam.classId}-${exam.maxMarks}-${exam.endDate || exam.date}`;
      const existing = groups.get(key);
      if (existing) {
        existing.examIds.push(exam.id);
        existing.subjectIds.push(exam.subjectId);
        existing.subjectCount += 1;
        if (exam.date < existing.startDate) existing.startDate = exam.date;
        if ((exam.endDate || exam.date) > existing.endDate) existing.endDate = exam.endDate || exam.date;
      } else {
        groups.set(key, {
          key,
          title: exam.title,
          type: exam.type,
          classId: exam.classId,
          className: exam.className,
          maxMarks: exam.maxMarks,
          examIds: [exam.id],
          subjectIds: [exam.subjectId],
          subjectCount: 1,
          startDate: exam.date,
          endDate: exam.endDate || exam.date,
        });
      }
      return groups;
    }, new Map<string, any>()).values()
  ).map((group: any) => ({
    ...group,
    skippedSundays: countSundays(group.startDate, group.endDate),
  }));

  return NextResponse.json({ examRows, examGroups });
});

export const POST = requireRole(["INSTITUTION", "INSTITUTION_ADMIN"], async (req: NextRequest, { session }) => {
  try {
    const institutionId = getTenantContext(session);
    const body = await req.json();

    const classId = Number(body.classId);
    const type = String(body.type || "");
    const title = String(body.title || "").trim();
    const maxMarks = Number(body.maxMarks);
    const date = String(body.date || "");
    const subjectIds = Array.isArray(body.subjectIds) ? body.subjectIds.map(Number).filter((n: number) => Number.isInteger(n) && n > 0) : [];

    if (!Number.isInteger(classId) || !INSTITUTION_EXAM_TYPES.has(type) || !title || !date || !Number.isFinite(maxMarks) || maxMarks <= 0 || subjectIds.length === 0) {
      return NextResponse.json({ error: "Exam title, class, date, marks, and subjects are required" }, { status: 400 });
    }

    await requireInstitutionClass(institutionId, classId);
    const validSubjectIds = await requireInstitutionSubjects(institutionId, subjectIds);
    const holidaySet = await getInstitutionHolidaySet(institutionId);
    const examSchedule = buildExamDates(date, validSubjectIds.length, holidaySet);

    for (const [index, subjectId] of validSubjectIds.entries()) {
      await db.insert(tests).values({
        institutionId,
        classId,
        sectionId: null,
        subjectId,
        staffId: null,
        createdByRole: "INSTITUTION",
        type: type as "MONTHLY" | "MID" | "FINAL" | "PROMOTION",
        title,
        maxMarks,
        date: examSchedule.dates[index],
        endDate: examSchedule.endDate,
        resultsPublishedAt: new Date(),
      });
    }

    await createExamAnnouncement(institutionId, classId, title, type, examSchedule.startDate, examSchedule.endDate, validSubjectIds.length, "created");
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to create exam timetable" }, { status: 500 });
  }
});

export const PATCH = requireRole(["INSTITUTION", "INSTITUTION_ADMIN"], async (req: NextRequest, { session }) => {
  try {
    const institutionId = getTenantContext(session);
    const body = await req.json();

    const examIds = Array.isArray(body.examIds) ? body.examIds.map(Number).filter((n: number) => Number.isInteger(n) && n > 0) : [];
    const classId = Number(body.classId);
    const type = String(body.type || "");
    const title = String(body.title || "").trim();
    const maxMarks = Number(body.maxMarks);
    const date = String(body.date || "");
    const subjectIds = Array.isArray(body.subjectIds) ? body.subjectIds.map(Number).filter((n: number) => Number.isInteger(n) && n > 0) : [];

    if (examIds.length === 0 || !Number.isInteger(classId) || !INSTITUTION_EXAM_TYPES.has(type) || !title || !date || !Number.isFinite(maxMarks) || maxMarks <= 0 || subjectIds.length === 0) {
      return NextResponse.json({ error: "Exam selection, class, date, marks, and subjects are required" }, { status: 400 });
    }

    const existingRows = await db.select().from(tests).where(and(
      eq(tests.institutionId, institutionId),
      eq(tests.createdByRole, "INSTITUTION"),
      inArray(tests.id, examIds)
    ));
    if (existingRows.length !== examIds.length) {
      return NextResponse.json({ error: "One or more exam rows were not found" }, { status: 404 });
    }

    await requireInstitutionClass(institutionId, classId);
    const validSubjectIds = await requireInstitutionSubjects(institutionId, subjectIds);
    const holidaySet = await getInstitutionHolidaySet(institutionId);
    const examSchedule = buildExamDates(date, validSubjectIds.length, holidaySet);
    const existingBySubject = new Map(existingRows.map((row) => [row.subjectId, row]));
    const nextSubjectSet = new Set(validSubjectIds);

    for (const [index, subjectId] of validSubjectIds.entries()) {
      const existing = existingBySubject.get(subjectId);
      const values = {
        classId,
        sectionId: null,
        subjectId,
        staffId: null,
        createdByRole: "INSTITUTION" as const,
        type: type as "MONTHLY" | "MID" | "FINAL" | "PROMOTION",
        title,
        maxMarks,
        date: examSchedule.dates[index],
        endDate: examSchedule.endDate,
        resultsPublishedAt: new Date(),
      };

      if (existing) {
        await db.update(tests).set(values).where(and(eq(tests.id, existing.id), eq(tests.institutionId, institutionId)));
      } else {
        await db.insert(tests).values({ institutionId, ...values });
      }
    }

    const removedIds = existingRows.filter((row) => !nextSubjectSet.has(row.subjectId)).map((row) => row.id);
    if (removedIds.length > 0) {
      await db.delete(tests).where(and(
        eq(tests.institutionId, institutionId),
        eq(tests.createdByRole, "INSTITUTION"),
        inArray(tests.id, removedIds)
      ));
    }

    await createExamAnnouncement(institutionId, classId, title, type, examSchedule.startDate, examSchedule.endDate, validSubjectIds.length, "updated");
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to update exam timetable" }, { status: 500 });
  }
});

export const DELETE = requireRole(["INSTITUTION", "INSTITUTION_ADMIN"], async (req: NextRequest, { session }) => {
  try {
    const institutionId = getTenantContext(session);
    const body = await req.json().catch(() => ({}));
    const examIds = Array.isArray(body.examIds) ? body.examIds.map(Number).filter((n: number) => Number.isInteger(n) && n > 0) : [];
    if (examIds.length === 0) {
      return NextResponse.json({ error: "Exam selection is required" }, { status: 400 });
    }

    const existingRows = await db.select().from(tests).where(and(
      eq(tests.institutionId, institutionId),
      eq(tests.createdByRole, "INSTITUTION"),
      inArray(tests.id, examIds)
    ));

    await db.delete(tests).where(and(
      eq(tests.institutionId, institutionId),
      eq(tests.createdByRole, "INSTITUTION"),
      inArray(tests.id, examIds)
    ));

    const first = existingRows[0];
    if (first) {
      await createExamAnnouncement(
        institutionId,
        first.classId,
        first.title,
        first.type,
        first.date,
        first.endDate || first.date,
        existingRows.length,
        "cancelled"
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to delete exam timetable" }, { status: 500 });
  }
});
