"use server";

import { db } from "@/db";
import {
  assignments,
  announcements,
  classes,
  institutionHolidays,
  marks,
  sections,
  staffAssignments,
  students,
  subjects,
  submissions,
  tests,
} from "@/db/schema";
import { assertCampusWritable } from "@/lib/campus-view";
import { getSession } from "@/lib/auth";
import { getTenantContext } from "@/lib/rbac";
import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import cloudinary from "@/lib/cloudinary";
import type { JWTPayload } from "@/lib/auth-types";
import { ownsUploadPublicId } from "@/lib/upload-ownership";
import Papa from "papaparse";
import { invalidateStudentMarksCaches } from "@/lib/redis";

const STAFF_TEST_TYPES = new Set(["DAILY", "WEEKLY", "QUIZ"]);
const INSTITUTION_EXAM_TYPES = new Set(["MONTHLY", "MID", "FINAL", "PROMOTION"]);
const MAX_SUBMISSION_BYTES = 5 * 1024 * 1024;
const ALLOWED_SUBMISSION_FORMATS = new Set(["pdf", "docx", "txt", "jpg", "jpeg", "png", "webp"]);

function parseLocalDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) throw new Error("Invalid exam start date");
  return new Date(Date.UTC(year, month - 1, day));
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
  while (isExamOffDay(next, holidays)) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
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

function toNumber(value: FormDataEntryValue | null, field: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${field} is required`);
  }
  return parsed;
}

function toOptionalNumber(value: FormDataEntryValue | null) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function requireStaffSection(staffId: number, institutionId: number, sectionId: number, subjectId?: number) {
  const conditions = [
    eq(staffAssignments.staffId, staffId),
    eq(staffAssignments.institutionId, institutionId),
    eq(staffAssignments.sectionId, sectionId),
  ];

  if (subjectId) conditions.push(eq(staffAssignments.subjectId, subjectId));

  const [assignment] = await db.select().from(staffAssignments).where(and(...conditions)).limit(1);
  if (!assignment) {
    throw new Error("This class or subject is not assigned to this staff account");
  }

  const [section] = await db.select().from(sections).where(eq(sections.id, sectionId)).limit(1);
  if (!section || section.institutionId !== institutionId) {
    throw new Error("Invalid class section");
  }

  return section;
}

async function requireInstitutionClass(institutionId: number, classId: number) {
  const [classRow] = await db.select().from(classes).where(and(eq(classes.id, classId), eq(classes.institutionId, institutionId))).limit(1);
  if (!classRow) throw new Error("Invalid class");
  return classRow;
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
  const [classRow] = await db.select({ name: classes.name }).from(classes).where(and(eq(classes.id, classId), eq(classes.institutionId, institutionId))).limit(1);
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

async function requireInstitutionSubjects(institutionId: number, subjectIds: number[]) {
  const uniqueSubjectIds = Array.from(new Set(subjectIds));
  const rows = await db.select().from(subjects).where(and(eq(subjects.institutionId, institutionId), inArray(subjects.id, uniqueSubjectIds)));
  if (rows.length !== uniqueSubjectIds.length) {
    throw new Error("One or more subjects do not belong to this institution");
  }
  return uniqueSubjectIds;
}

export async function createStaffAssignmentAction(formData: FormData) {
  const session = await getSession();
  if (!session || session.role !== "STAFF" || !session.institutionId) throw new Error("Unauthorized");

  const sectionId = toNumber(formData.get("sectionId"), "Section");
  const subjectId = toOptionalNumber(formData.get("subjectId"));
  const title = String(formData.get("title") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const referenceFileKey = String(formData.get("referenceFileKey") || "").trim();
  const referenceFileName = String(formData.get("referenceFileName") || "").trim();
  const dueAtRaw = String(formData.get("dueAt") || "");
  if (!title || !dueAtRaw) throw new Error("Title and due date are required");
  if (referenceFileKey && !referenceFileName) throw new Error("Reference file name is missing");
  if (referenceFileName.length > 255) throw new Error("Reference file name is too long");

  const section = await requireStaffSection(session.userId, session.institutionId, sectionId, subjectId ?? undefined);
  if (subjectId) await requireInstitutionSubjects(session.institutionId, [subjectId]);

  const referenceResource = referenceFileKey
    ? await verifyCloudinarySubmission(referenceFileKey, session)
    : null;

  await db.insert(assignments).values({
    institutionId: session.institutionId,
    staffId: session.userId,
    classId: section.classId,
    sectionId,
    subjectId,
    title,
    description: description || null,
    referenceFileUrl: referenceResource?.secure_url || null,
    referenceFileName: referenceResource ? referenceFileName : null,
    dueAt: new Date(dueAtRaw),
  });

  revalidatePath("/staff/assignments");
  revalidatePath("/student/submissions");
}

export async function createStaffAssessmentAction(formData: FormData) {
  const session = await getSession();
  if (!session || session.role !== "STAFF" || !session.institutionId) throw new Error("Unauthorized");

  const sectionId = toNumber(formData.get("sectionId"), "Section");
  const type = String(formData.get("type") || "");
  if (!STAFF_TEST_TYPES.has(type)) throw new Error("Staff can only create Daily, Weekly, or Quiz assessments");

  const title = String(formData.get("title") || "").trim();
  const maxMarks = Number(formData.get("maxMarks"));
  const date = String(formData.get("date") || "");
  const subjectIds = formData.getAll("subjectIds").map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0);
  if (!title || !date || !Number.isFinite(maxMarks) || maxMarks <= 0 || subjectIds.length === 0) {
    throw new Error("Assessment title, date, marks, and subjects are required");
  }

  const section = await requireStaffSection(session.userId, session.institutionId, sectionId);
  await requireInstitutionSubjects(session.institutionId, subjectIds);

  for (const subjectId of Array.from(new Set(subjectIds))) {
    await requireStaffSection(session.userId, session.institutionId, sectionId, subjectId);
    await db.insert(tests).values({
      institutionId: session.institutionId,
      classId: section.classId,
      sectionId,
      subjectId,
      staffId: session.userId,
      createdByRole: "STAFF",
      type: type as "DAILY" | "WEEKLY" | "QUIZ",
      title,
      maxMarks,
      date,
      resultsPublishedAt: null,
    });
  }

  revalidatePath("/staff/marks");
}

export async function createInstitutionExamAction(formData: FormData) {
  const session = await getSession();
  assertCampusWritable(session);
  if (!session || (session.role !== "INSTITUTION" && session.role !== "INSTITUTION_ADMIN")) throw new Error("Unauthorized");

  const institutionId = getTenantContext(session);
  const classId = toNumber(formData.get("classId"), "Class");
  const type = String(formData.get("type") || "");
  if (!INSTITUTION_EXAM_TYPES.has(type)) throw new Error("Institution exams must be Monthly, Mid, Final, or Promotion");

  const title = String(formData.get("title") || "").trim();
  const maxMarks = Number(formData.get("maxMarks"));
  const date = String(formData.get("date") || "");
  const subjectIds = formData.getAll("subjectIds").map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0);
  if (!title || !date || !Number.isFinite(maxMarks) || maxMarks <= 0 || subjectIds.length === 0) {
    throw new Error("Exam title, date, marks, and subjects are required");
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

  revalidatePath("/institution/exams");
  revalidatePath("/staff/exams");
  revalidatePath("/student/exams");
}

function parseExamIds(value: FormDataEntryValue | null) {
  const ids = String(value || "")
    .split(",")
    .map((id) => Number(id.trim()))
    .filter((id) => Number.isInteger(id) && id > 0);

  if (ids.length === 0) throw new Error("Exam selection is required");
  return Array.from(new Set(ids));
}

export async function updateInstitutionExamAction(formData: FormData) {
  const session = await getSession();
  assertCampusWritable(session);
  if (!session || (session.role !== "INSTITUTION" && session.role !== "INSTITUTION_ADMIN")) throw new Error("Unauthorized");

  const institutionId = getTenantContext(session);
  const examIds = parseExamIds(formData.get("examIds"));
  const classId = toNumber(formData.get("classId"), "Class");
  const type = String(formData.get("type") || "");
  if (!INSTITUTION_EXAM_TYPES.has(type)) throw new Error("Institution exams must be Monthly, Mid, Final, or Promotion");

  const title = String(formData.get("title") || "").trim();
  const maxMarks = Number(formData.get("maxMarks"));
  const date = String(formData.get("date") || "");
  const subjectIds = formData.getAll("subjectIds").map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0);
  if (!title || !date || !Number.isFinite(maxMarks) || maxMarks <= 0 || subjectIds.length === 0) {
    throw new Error("Exam title, date, marks, and subjects are required");
  }

  const existingRows = await db.select().from(tests).where(and(
    eq(tests.institutionId, institutionId),
    eq(tests.createdByRole, "INSTITUTION"),
    inArray(tests.id, examIds)
  ));
  if (existingRows.length !== examIds.length) throw new Error("One or more exam rows were not found");

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
      await db.update(tests)
        .set(values)
        .where(and(eq(tests.id, existing.id), eq(tests.institutionId, institutionId)));
    } else {
      await db.insert(tests).values({
        institutionId,
        ...values,
      });
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

  revalidatePath("/institution/exams");
  revalidatePath("/staff/exams");
  revalidatePath("/student/exams");
}

export async function deleteInstitutionExamAction(formData: FormData) {
  const session = await getSession();
  assertCampusWritable(session);
  if (!session || (session.role !== "INSTITUTION" && session.role !== "INSTITUTION_ADMIN")) throw new Error("Unauthorized");

  const institutionId = getTenantContext(session);
  const examIds = parseExamIds(formData.get("examIds"));
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

  revalidatePath("/institution/exams");
  revalidatePath("/staff/exams");
  revalidatePath("/student/exams");
}

function parseMarksCsv(text: string) {
  const parsed = Papa.parse<string[]>(text.replace(/^\uFEFF/, ""), { skipEmptyLines: true });
  if (parsed.errors.length > 0) throw new Error(`CSV could not be read: ${parsed.errors[0].message}`);
  const rows = parsed.data.map((row) => row.map((cell) => String(cell ?? "").trim()));
  if (rows.length === 0) throw new Error("CSV file is empty");

  const normalizedHeader = rows[0].map((cell) => cell.toLowerCase().replace(/[^a-z]/g, ""));
  const hasHeader = normalizedHeader.includes("rollnumber") || normalizedHeader.includes("marksobtained");
  const rollIndex = hasHeader ? normalizedHeader.indexOf("rollnumber") : 0;
  const nameIndex = hasHeader ? normalizedHeader.indexOf("studentname") : -1;
  const obtainedIndex = hasHeader ? normalizedHeader.indexOf("marksobtained") : 1;
  const totalIndex = hasHeader ? normalizedHeader.indexOf("totalmarks") : 2;
  if (rollIndex < 0 || obtainedIndex < 0 || totalIndex < 0) {
    throw new Error("CSV headers must include Roll Number, Marks Obtained, and Total Marks");
  }

  return rows.slice(hasHeader ? 1 : 0).map((row, index) => {
    const rollNumber = row[rollIndex];
    const studentName = nameIndex >= 0 ? row[nameIndex] : "";
    const obtainedRaw = row[obtainedIndex];
    const totalRaw = row[totalIndex];
    if (!rollNumber || !obtainedRaw || !totalRaw) {
      throw new Error(`CSV row ${index + (hasHeader ? 2 : 1)} is incomplete`);
    }
    const marksObtained = Number(obtainedRaw);
    const totalMarks = Number(totalRaw);
    if (!Number.isFinite(marksObtained) || !Number.isFinite(totalMarks) || marksObtained < 0 || totalMarks <= 0 || marksObtained > totalMarks) {
      throw new Error(`CSV row ${index + (hasHeader ? 2 : 1)} has invalid marks`);
    }
    return { rollNumber, studentName: studentName || null, marksObtained, totalMarks };
  });
}

async function requireMarkableTest(session: { userId: number; institutionId: number }, testId: number) {
  const [test] = await db.select().from(tests).where(and(eq(tests.id, testId), eq(tests.institutionId, session.institutionId))).limit(1);
  if (!test) throw new Error("Assessment not found");

  if (test.createdByRole === "STAFF" && test.staffId !== session.userId) {
    throw new Error("Only the staff member who created this assessment can mark it");
  }

  if (test.createdByRole === "INSTITUTION") {
    const assigned = await db.select()
      .from(staffAssignments)
      .innerJoin(sections, eq(staffAssignments.sectionId, sections.id))
      .where(
        and(
          eq(staffAssignments.staffId, session.userId),
          eq(staffAssignments.institutionId, session.institutionId),
          eq(staffAssignments.subjectId, test.subjectId),
          eq(sections.classId, test.classId)
        )
      );
    if (assigned.length === 0) throw new Error("This exam subject is not assigned to this staff account");
  }

  return test;
}

async function saveMarksForRecords(
  session: { userId: number; institutionId: number },
  test: typeof tests.$inferSelect,
  sectionId: number,
  records: { rollNumber: string; studentName?: string | null; marksObtained: number; totalMarks: number }[],
  options: { overwrite?: boolean } = {}
) {
  if (records.length === 0) throw new Error("No marks provided");
  const section = await requireStaffSection(session.userId, session.institutionId, sectionId, test.subjectId);
  if (section.classId !== test.classId || (test.sectionId && test.sectionId !== sectionId)) {
    throw new Error("This assessment does not belong to the selected section");
  }

  const expectedTotal = Number(test.maxMarks);
  const badTotal = records.find((record) => record.totalMarks !== expectedTotal);
  if (badTotal) throw new Error(`Total marks must match assessment total of ${expectedTotal}`);

  const rollNumbers = records.map((record) => record.rollNumber);
  const uniqueRollNumbers = new Set(rollNumbers);
  if (uniqueRollNumbers.size !== rollNumbers.length) {
    throw new Error("Duplicate roll numbers are not allowed");
  }

  const studentRows = await db.select().from(students).where(
    and(
      eq(students.institutionId, session.institutionId),
      eq(students.classId, test.classId),
      eq(students.sectionId, sectionId),
      sql`${students.deletedAt} IS NULL`,
      inArray(students.classRollNumber, rollNumbers)
    )
  );

  if (studentRows.length !== records.length) {
    throw new Error("Every roll number must match a student in this class");
  }

  const studentByRoll = new Map(studentRows.map((student) => [student.classRollNumber, student]));
  for (const record of records) {
    const student = studentByRoll.get(record.rollNumber);
    if (record.studentName && student && record.studentName.toLocaleLowerCase() !== student.name.trim().toLocaleLowerCase()) {
      throw new Error(`Student name does not match roll number ${record.rollNumber}`);
    }
  }
  const studentIds = studentRows.map((student) => student.id);
  const existingMarks = await db.select({ studentId: marks.studentId })
    .from(marks)
    .where(and(
      eq(marks.institutionId, session.institutionId),
      eq(marks.testId, test.id),
      inArray(marks.studentId, studentIds)
    ));

  if (existingMarks.length > 0 && !options.overwrite) {
    const existingIds = new Set(existingMarks.map((mark) => mark.studentId));
    const duplicateRolls = studentRows
      .filter((student) => existingIds.has(student.id))
      .map((student) => student.classRollNumber)
      .join(", ");
    throw new Error(`Marks already exist for roll number(s): ${duplicateRolls}. Enable overwrite to replace them.`);
  }

  const insertData = records.map((record) => {
    const student = studentByRoll.get(record.rollNumber);
    if (!student) throw new Error(`Roll number ${record.rollNumber} was not found`);
    return {
      institutionId: session.institutionId,
      testId: test.id,
      studentId: student.id,
      marksObtained: record.marksObtained,
      totalMarks: record.totalMarks,
    };
  });

  if (options.overwrite) {
    await db.insert(marks).values(insertData).onConflictDoUpdate({
      target: [marks.testId, marks.studentId],
      set: {
        marksObtained: sql`EXCLUDED.marks_obtained`,
        totalMarks: sql`EXCLUDED.total_marks`,
      },
    });
  } else {
    await db.insert(marks).values(insertData);
  }

  await invalidateStudentMarksCaches(session.institutionId, studentIds);

  revalidatePath("/staff/marks");
  revalidatePath("/student/marks");
  revalidatePath("/parent/dashboard");
  revalidatePath("/parent/results");
}

export async function uploadMarksCsvAction(formData: FormData) {
  const session = await getSession();
  if (!session || session.role !== "STAFF" || !session.institutionId) throw new Error("Unauthorized");
  const staffSession = { userId: session.userId, institutionId: session.institutionId };

  const testId = toNumber(formData.get("testId"), "Assessment");
  const sectionId = toNumber(formData.get("sectionId"), "Section");
  const file = formData.get("csv");
  if (!(file instanceof File) || file.size === 0) throw new Error("CSV file is required");

  const test = await requireMarkableTest(staffSession, testId);
  const records = parseMarksCsv(await file.text());
  await saveMarksForRecords(staffSession, test, sectionId, records, { overwrite: formData.get("overwrite") === "on" });
}

export async function enterMarksManuallyAction(formData: FormData) {
  const session = await getSession();
  if (!session || session.role !== "STAFF" || !session.institutionId) throw new Error("Unauthorized");
  const staffSession = { userId: session.userId, institutionId: session.institutionId };

  const testId = toNumber(formData.get("testId"), "Assessment");
  const sectionId = toNumber(formData.get("sectionId"), "Section");
  const totalMarks = Number(formData.get("totalMarks"));
  const rollNumbers = formData.getAll("rollNumber").map((value) => String(value).trim());
  const obtainedMarks = formData.getAll("marksObtained").map((value) => String(value).trim());

  if (!Number.isFinite(totalMarks) || totalMarks <= 0) throw new Error("Total marks are required");
  if (rollNumbers.length !== obtainedMarks.length) throw new Error("Invalid marks form");

  const records = rollNumbers.map((rollNumber, index) => {
    const marksObtained = Number(obtainedMarks[index]);
    if (!rollNumber || !Number.isFinite(marksObtained) || marksObtained < 0 || marksObtained > totalMarks) {
      throw new Error(`Invalid marks for roll number ${rollNumber || index + 1}`);
    }
    return { rollNumber, marksObtained, totalMarks };
  });

  const test = await requireMarkableTest(staffSession, testId);
  await saveMarksForRecords(staffSession, test, sectionId, records, { overwrite: true });
}

export async function publishStaffAssessmentResultsAction(formData: FormData) {
  const session = await getSession();
  if (!session || session.role !== "STAFF" || !session.institutionId) throw new Error("Unauthorized");

  const testId = toNumber(formData.get("testId"), "Assessment");
  const sectionId = toNumber(formData.get("sectionId"), "Section");
  const test = await requireMarkableTest({ userId: session.userId, institutionId: session.institutionId }, testId);
  if (test.createdByRole !== "STAFF" || test.staffId !== session.userId || test.sectionId !== sectionId) {
    throw new Error("Only the teacher who created this class assessment can publish it");
  }
  await requireStaffSection(session.userId, session.institutionId, sectionId, test.subjectId);

  const [rosterCount] = await db.select({ value: sql<number>`count(*)::int` }).from(students).where(and(
    eq(students.institutionId, session.institutionId),
    eq(students.sectionId, sectionId),
    sql`${students.deletedAt} IS NULL`
  ));
  const resultRows = await db.select({ studentId: marks.studentId })
    .from(marks)
    .innerJoin(students, eq(students.id, marks.studentId))
    .where(and(
      eq(marks.institutionId, session.institutionId),
      eq(marks.testId, testId),
      eq(students.institutionId, session.institutionId),
      eq(students.sectionId, sectionId),
      sql`${students.deletedAt} IS NULL`
    ));
  if (!rosterCount?.value) throw new Error("This section has no active students");
  if (resultRows.length !== Number(rosterCount.value)) {
    throw new Error(`Enter results for all ${rosterCount.value} students before publishing`);
  }

  await db.update(tests).set({ resultsPublishedAt: new Date() }).where(and(
    eq(tests.id, testId),
    eq(tests.institutionId, session.institutionId),
    eq(tests.staffId, session.userId)
  ));
  await invalidateStudentMarksCaches(session.institutionId, resultRows.map((row) => row.studentId));
  revalidatePath("/staff/marks");
  revalidatePath("/student/marks");
  revalidatePath("/parent/dashboard");
  revalidatePath("/parent/results");
}

export async function saveStudentSubmission(assignmentId: number, fileKey: string) {
  const session = await getSession();
  if (!session || session.role !== "STUDENT" || !session.institutionId) throw new Error("Unauthorized");

  const [student] = await db.select().from(students).where(eq(students.id, session.userId)).limit(1);
  if (!student || student.institutionId !== session.institutionId) throw new Error("Student not found");

  const [assignment] = await db.select().from(assignments).where(and(eq(assignments.id, assignmentId), eq(assignments.institutionId, session.institutionId))).limit(1);
  if (!assignment) throw new Error("Assignment not found");
  if (assignment.classId !== student.classId) throw new Error("This assignment is not for your class");
  if (assignment.sectionId && assignment.sectionId !== student.sectionId) throw new Error("This assignment is not for your section");
  const cloudinaryResource = await verifyCloudinarySubmission(fileKey, session);
  const fileUrl = typeof cloudinaryResource.secure_url === "string"
    ? cloudinaryResource.secure_url
    : null;

  await db.insert(submissions).values({
    institutionId: session.institutionId,
    assignmentId,
    studentId: student.id,
    fileKey,
    fileUrl,
  }).onConflictDoUpdate({
    target: [submissions.assignmentId, submissions.studentId],
    set: { fileKey, fileUrl },
  });

  revalidatePath("/student/submissions");
}

export async function verifyCloudinarySubmission(fileKey: string, session: JWTPayload) {
  if (!fileKey || fileKey.includes("://") || !ownsUploadPublicId(session, fileKey)) {
    throw new Error("Invalid uploaded file reference");
  }

  const resource = await getCloudinaryResource(fileKey);
  const bytes = Number(resource.bytes || 0);
  const format = String(resource.format || "").toLowerCase();

  if (bytes <= 0 || bytes > MAX_SUBMISSION_BYTES) {
    throw new Error("Uploaded file exceeds the allowed size");
  }
  if (!ALLOWED_SUBMISSION_FORMATS.has(format)) {
    throw new Error("Uploaded file type is not allowed");
  }
  return resource;
}

async function getCloudinaryResource(publicId: string) {
  for (const resourceType of ["image", "raw"] as const) {
    try {
      return await cloudinary.api.resource(publicId, { resource_type: resourceType });
    } catch {
      // Cloudinary separates images and raw documents; try both before rejecting.
    }
  }
  throw new Error("Uploaded file could not be verified");
}
