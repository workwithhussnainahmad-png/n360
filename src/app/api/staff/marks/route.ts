import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { tests, classes, sections, subjects, staffAssignments, students, marks } from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { eq, and, inArray, isNull, or } from "drizzle-orm";
import { invalidateInstitutionRosterCaches } from "@/lib/redis";

export const GET = requireRole(["STAFF"], async (req: NextRequest, { session }) => {
  if (!session.institutionId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const instId = session.institutionId!;
    const staffId = session.userId;
    const view = req.nextUrl.searchParams.get("view");
    const sectionIdParam = req.nextUrl.searchParams.get("sectionId");
    const testIdParam = req.nextUrl.searchParams.get("testId");

    if (!view && !sectionIdParam && !testIdParam) {
      return NextResponse.json({
        error: "Scoped query required. Use ?view=metadata or ?sectionId=… (optional &testId=…).",
      }, { status: 400 });
    }
    if (view && view !== "metadata") return NextResponse.json({ error: "Invalid view" }, { status: 400 });
    if (testIdParam && !sectionIdParam) return NextResponse.json({ error: "sectionId is required with testId" }, { status: 400 });

    const assignedSlots = await db.select({
      sectionId: sections.id, sectionName: sections.name, classId: classes.id, className: classes.name,
      subjectId: subjects.id, subjectName: subjects.name,
    }).from(staffAssignments)
      .innerJoin(sections, eq(staffAssignments.sectionId, sections.id))
      .innerJoin(classes, eq(sections.classId, classes.id))
      .leftJoin(subjects, eq(staffAssignments.subjectId, subjects.id))
      .where(and(eq(staffAssignments.staffId, staffId), eq(staffAssignments.institutionId, instId)));
    const sectionOptions = Array.from(new Map(assignedSlots.map((slot) => [slot.sectionId, {
      id: slot.sectionId, name: slot.sectionName, classId: slot.classId, className: slot.className,
    }])).values());
    const subjectOptions = Array.from(new Map(assignedSlots
      .filter((slot) => slot.subjectId && slot.subjectName)
      .map((slot) => [slot.subjectId!, { id: slot.subjectId!, name: slot.subjectName!, sectionId: slot.sectionId }])).values());
    if (view === "metadata") return NextResponse.json({ sectionOptions, subjectOptions });

    const sectionId = Number(sectionIdParam);
    if (!Number.isInteger(sectionId) || sectionId <= 0) return NextResponse.json({ error: "Invalid sectionId" }, { status: 400 });
    const sectionSlots = assignedSlots.filter((slot) => slot.sectionId === sectionId);
    if (sectionSlots.length === 0) return NextResponse.json({ error: "You are not assigned to this section" }, { status: 403 });
    const subjectIds = sectionSlots.flatMap((slot) => slot.subjectId ? [slot.subjectId] : []);
    const classId = sectionSlots[0].classId;
    if (subjectIds.length === 0) {
      if (testIdParam) return NextResponse.json({ error: "Assessment not found in this section" }, { status: 404 });
      return NextResponse.json({ tests: [], sectionOptions, subjectOptions });
    }
    const scopedTests = await db.select({
      id: tests.id, title: tests.title, type: tests.type, maxMarks: tests.maxMarks, date: tests.date,
      createdByRole: tests.createdByRole, staffId: tests.staffId, classId: tests.classId, sectionId: tests.sectionId,
      subjectId: tests.subjectId, className: classes.name, sectionName: sections.name, subjectName: subjects.name,
    }).from(tests)
      .innerJoin(classes, eq(tests.classId, classes.id))
      .leftJoin(sections, eq(tests.sectionId, sections.id))
      .leftJoin(subjects, eq(tests.subjectId, subjects.id))
      .where(and(eq(tests.institutionId, instId), or(
        and(eq(tests.createdByRole, "STAFF"), eq(tests.staffId, staffId), eq(tests.sectionId, sectionId)),
        and(eq(tests.createdByRole, "INSTITUTION"), eq(tests.classId, classId), inArray(tests.subjectId, subjectIds), or(eq(tests.sectionId, sectionId), isNull(tests.sectionId)))
      )));
    if (!testIdParam) return NextResponse.json({ tests: scopedTests, sectionOptions, subjectOptions });

    const testId = Number(testIdParam);
    const test = scopedTests.find((row) => row.id === testId);
    if (!test) return NextResponse.json({ error: "Assessment not found in this section" }, { status: 404 });
    const roster = await db.select({ id: students.id, name: students.name, rollNumber: students.classRollNumber })
      .from(students).where(and(eq(students.institutionId, instId), eq(students.sectionId, sectionId)));
    const studentIds = roster.map((student) => student.id);
    const markRows = studentIds.length ? await db.select({ testId: marks.testId, studentId: marks.studentId, marksObtained: marks.marksObtained })
      .from(marks).where(and(eq(marks.institutionId, instId), eq(marks.testId, testId), inArray(marks.studentId, studentIds))) : [];
    return NextResponse.json({
      tests: [test], rosters: { [sectionId]: roster },
      marks: Object.fromEntries(markRows.map((row) => [`${row.testId}:${row.studentId}`, row.marksObtained])),
      sectionOptions, subjectOptions,
    });
  } catch (error) {
    console.error("Error fetching marks data:", error);
    return NextResponse.json({ error: "Failed to fetch marks data" }, { status: 500 });
  }
});

export const POST = requireRole(["STAFF"], async (req: NextRequest, { session }) => {
  if (!session.institutionId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { sectionId, type, title, maxMarks, date, subjectIds } = body;

    const parsedSectionId = Number(sectionId);
    if (!Number.isInteger(parsedSectionId) || parsedSectionId <= 0) {
      return NextResponse.json({ error: "Section is required" }, { status: 400 });
    }

    if (!["DAILY", "WEEKLY", "QUIZ"].includes(type)) {
      return NextResponse.json({ error: "Staff can only create Daily, Weekly, or Quiz assessments" }, { status: 400 });
    }

    const parsedMaxMarks = Number(maxMarks);
    if (!Number.isFinite(parsedMaxMarks) || parsedMaxMarks <= 0) {
      return NextResponse.json({ error: "Max marks must be greater than 0" }, { status: 400 });
    }

    if (!title || typeof title !== "string") return NextResponse.json({ error: "Title is required" }, { status: 400 });
    if (!date || typeof date !== "string") return NextResponse.json({ error: "Date is required" }, { status: 400 });

    if (!Array.isArray(subjectIds) || subjectIds.length === 0) {
      return NextResponse.json({ error: "At least one subject is required" }, { status: 400 });
    }

    // Verify staff has access to this section
    const [section] = await db.select().from(sections).where(and(eq(sections.id, parsedSectionId), eq(sections.institutionId, session.institutionId))).limit(1);
    
    if (!section) return NextResponse.json({ error: "Invalid class section" }, { status: 400 });

    const uniqueSubjectIds = Array.from(new Set(subjectIds.map(Number)));

    const assignments = await db.select({ subjectId: staffAssignments.subjectId }).from(staffAssignments).where(and(
      eq(staffAssignments.staffId, session.userId),
      eq(staffAssignments.institutionId, session.institutionId),
      eq(staffAssignments.sectionId, parsedSectionId),
      inArray(staffAssignments.subjectId, uniqueSubjectIds)
    ));

    if (assignments.length !== uniqueSubjectIds.length) {
      return NextResponse.json({ error: "One or more subjects are not assigned to you for this class" }, { status: 403 });
    }

    const newTests = uniqueSubjectIds.map(subjectId => ({
      institutionId: session.institutionId!,
      classId: section.classId,
      sectionId: parsedSectionId,
      subjectId,
      staffId: session.userId,
      createdByRole: "STAFF" as const,
      type: type as "DAILY" | "WEEKLY" | "QUIZ",
      title: title.trim(),
      maxMarks: parsedMaxMarks,
      date,
      resultsPublishedAt: null,
    }));

    await db.insert(tests).values(newTests);
    await invalidateInstitutionRosterCaches(session.institutionId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error creating assessment:", error);
    return NextResponse.json({ error: "Failed to create assessment" }, { status: 500 });
  }
});
