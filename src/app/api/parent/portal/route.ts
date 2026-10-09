import { inputErrorResponse } from '@/lib/input-error-response';
import { NextRequest, NextResponse } from "next/server";
import { and, asc, count, desc, eq, gte, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  assignments, attendances, courseClasses, courseLectureProgress, courseLectures, courses,
  diaries, feeInvoices, feePaymentSubmissions, leaveRequests, marks, staff, staffAssignments,
  students, subjects, tests, tickets,
} from "@/db/schema";
import { getSessionFromRequest } from "@/lib/auth";
import { withApiPolicy } from "@/lib/api-policy";
import { getVisibleAnnouncements } from "@/lib/announcements";
import { getParentPortalContext, ParentChildAccessError } from "@/lib/parent-access";
import { getParentHomeData } from "@/lib/parent-home-data";
import { pakistanDateKey, resolveParentPeriod } from "@/lib/parent-period";
export { corsPreflight as OPTIONS } from "@/lib/cors";

const allowedSections = new Set(["children", "home", "attendance", "results", "diary", "courses", "timetable", "fees", "notices", "account"]);

// API transport policy (session-header stripping, CORS) lives in the handler so
// the hot-path lane in scripts/standalone-server.cjs can serve it without the
// Proxy, exactly like the requireRole-wrapped portal reads.
export const GET = withApiPolicy(async (req: NextRequest) => {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || session.role !== "PARENT" || !session.institutionId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const section = req.nextUrl.searchParams.get("section") || "home";
    if (!allowedSections.has(section)) return NextResponse.json({ error: "Invalid parent portal section" }, { status: 400 });
    const requestedStudent = req.nextUrl.searchParams.get("student");
    const context = await getParentPortalContext(session, requestedStudent, { selectedOnly: section !== "children" && Boolean(requestedStudent) });
    const period = resolveParentPeriod(req.nextUrl.searchParams.get("period"), req.nextUrl.searchParams.get("anchor"));
    const base = { parent: context.parent, children: context.children, selectedStudent: context.selectedChild, period };
    const child = context.selectedChild;
    if (section === "children" || !child) return NextResponse.json(base);
    const institutionId = context.institutionId;

    if (section === "home") {
      const [data, announcements] = await Promise.all([
        getParentHomeData(institutionId, child, period),
        getVisibleAnnouncements({ ...session, role: "STUDENT", userId: child.id }, 5, { campusId: child.campusId, classId: child.classId, sectionId: child.sectionId, createdAt: child.createdAt }, { includeReadStatus: false }),
      ]);
      const { attendance, recentResults, fees, todayClasses, diary, upcomingTests } = data;
      const average = recentResults.length ? Math.round(recentResults.reduce((sum, row) => sum + (row.total > 0 ? row.obtained / row.total * 100 : 0), 0) / recentResults.length) : null;
      const periodAnnouncements = announcements.filter((item) => pakistanDateKey(item.createdAtIso) >= period.from && pakistanDateKey(item.createdAtIso) <= period.to);
      return NextResponse.json({ ...base, summary: { attendanceRate: attendance.total ? Math.round(attendance.attended / attendance.total * 100) : null, academicAverage: average, outstandingFees: fees.reduce((sum, row) => sum + row.total - row.paid, 0), classesToday: todayClasses.length }, todayClasses, recentResults, diary, upcomingTests, announcements: periodAnnouncements });
    }

    if (section === "attendance") {
      const rows = await db.select({ id: attendances.id, date: attendances.date, status: attendances.status }).from(attendances).where(and(eq(attendances.institutionId, institutionId), eq(attendances.studentId, child.id), gte(attendances.date, period.from), lte(attendances.date, period.to))).orderBy(asc(attendances.date)).limit(31);
      return NextResponse.json({ ...base, attendance: rows });
    }

    if (section === "results") {
      const [rows, performance] = await Promise.all([
        db.select({ id: marks.id, title: tests.title, type: tests.type, date: tests.date, subject: subjects.name, obtained: marks.marksObtained, total: marks.totalMarks }).from(marks).innerJoin(tests, eq(marks.testId, tests.id)).innerJoin(subjects, eq(tests.subjectId, subjects.id)).where(and(eq(marks.institutionId, institutionId), eq(marks.studentId, child.id), isNotNull(tests.resultsPublishedAt), gte(tests.date, period.from), lte(tests.date, period.to))).orderBy(desc(tests.date), desc(marks.id)).limit(50),
        db.select({ subject: subjects.name, average: sql<number>`round(avg(case when ${marks.totalMarks} > 0 then ${marks.marksObtained} * 100.0 / ${marks.totalMarks} else null end))::int`, assessments: count() }).from(marks).innerJoin(tests, eq(marks.testId, tests.id)).innerJoin(subjects, eq(tests.subjectId, subjects.id)).where(and(eq(marks.institutionId, institutionId), eq(marks.studentId, child.id), isNotNull(tests.resultsPublishedAt), gte(tests.date, period.from), lte(tests.date, period.to))).groupBy(subjects.id, subjects.name).orderBy(asc(subjects.name)),
      ]);
      return NextResponse.json({ ...base, results: rows, performance });
    }

    if (section === "diary") {
      const [entries, homework] = await Promise.all([
        db.select({ id: diaries.id, date: diaries.date, content: diaries.content, subject: subjects.name, teacher: staff.name }).from(diaries).leftJoin(subjects, eq(diaries.subjectId, subjects.id)).innerJoin(staff, eq(diaries.staffId, staff.id)).where(and(eq(diaries.institutionId, institutionId), eq(diaries.classId, child.classId), gte(diaries.date, period.from), lte(diaries.date, period.to))).orderBy(desc(diaries.date), desc(diaries.id)).limit(40),
        db.select({ id: assignments.id, title: assignments.title, description: assignments.description, dueAt: assignments.dueAt, subject: subjects.name, teacher: staff.name }).from(assignments).leftJoin(subjects, eq(assignments.subjectId, subjects.id)).innerJoin(staff, eq(assignments.staffId, staff.id)).where(and(eq(assignments.institutionId, institutionId), eq(assignments.classId, child.classId), or(eq(assignments.sectionId, child.sectionId), isNull(assignments.sectionId)), gte(assignments.dueAt, new Date(`${period.from}T00:00:00Z`)), lte(assignments.dueAt, new Date(`${period.to}T23:59:59Z`)))).orderBy(asc(assignments.dueAt)).limit(20),
      ]);
      return NextResponse.json({ ...base, diary: entries, homework });
    }

    if (section === "courses") {
      const courseRows = await db.select({ id: courses.id, title: courses.title, subject: subjects.name, teacher: staff.name }).from(courses).innerJoin(courseClasses, eq(courseClasses.courseId, courses.id)).innerJoin(subjects, eq(courses.subjectId, subjects.id)).innerJoin(staff, eq(courses.staffId, staff.id)).where(and(eq(courses.institutionId, institutionId), eq(courseClasses.classId, child.classId), eq(courses.isActive, true))).orderBy(asc(courses.title)).limit(20);
      const ids = courseRows.map((row) => row.id);
      const lectures = ids.length ? await db.select({ id: courseLectures.id, courseId: courseLectures.courseId }).from(courseLectures).where(inArray(courseLectures.courseId, ids)) : [];
      const progress = lectures.length ? await db.select({ lectureId: courseLectureProgress.lectureId }).from(courseLectureProgress).where(and(eq(courseLectureProgress.studentId, child.id), inArray(courseLectureProgress.lectureId, lectures.map((row) => row.id)))) : [];
      const doneIds = new Set(progress.map((row) => row.lectureId));
      return NextResponse.json({ ...base, courses: courseRows.map((course) => ({ ...course, total: lectures.filter((item) => item.courseId === course.id).length, completed: lectures.filter((item) => item.courseId === course.id && doneIds.has(item.id)).length })) });
    }

    if (section === "timetable") {
      const [schedule, upcomingTests] = await Promise.all([
        db.select({ id: staffAssignments.id, day: staffAssignments.dayOfWeek, start: staffAssignments.startTime, end: staffAssignments.endTime, subject: subjects.name, teacher: staff.name, isBreak: staffAssignments.isBreak }).from(staffAssignments).leftJoin(subjects, eq(staffAssignments.subjectId, subjects.id)).leftJoin(staff, eq(staffAssignments.staffId, staff.id)).where(and(eq(staffAssignments.institutionId, institutionId), eq(staffAssignments.sectionId, child.sectionId))).orderBy(asc(staffAssignments.dayOfWeek), asc(staffAssignments.startTime)),
        db.select({ id: tests.id, title: tests.title, type: tests.type, date: tests.date, subject: subjects.name }).from(tests).innerJoin(subjects, eq(tests.subjectId, subjects.id)).where(and(eq(tests.institutionId, institutionId), eq(tests.classId, child.classId), or(eq(tests.sectionId, child.sectionId), isNull(tests.sectionId)), gte(tests.date, period.from), lte(tests.date, period.to))).orderBy(asc(tests.date)).limit(20),
      ]);
      return NextResponse.json({ ...base, schedule, upcomingTests });
    }

    if (section === "fees") {
      const invoices = await db.select().from(feeInvoices).where(and(eq(feeInvoices.institutionId, institutionId), eq(feeInvoices.studentId, child.id))).orderBy(desc(feeInvoices.billingMonth), desc(feeInvoices.createdAt), desc(feeInvoices.id)).limit(24);
      const invoiceIds = invoices.map((row) => row.id);
      const submissions = invoiceIds.length ? await db.select({ id: feePaymentSubmissions.id, invoiceId: feePaymentSubmissions.invoiceId, amount: feePaymentSubmissions.amount, sourceBankName: feePaymentSubmissions.sourceBankName, transactionId: feePaymentSubmissions.transactionId, status: feePaymentSubmissions.status, submittedAt: feePaymentSubmissions.submittedAt }).from(feePaymentSubmissions).where(and(eq(feePaymentSubmissions.institutionId, institutionId), eq(feePaymentSubmissions.studentId, child.id), inArray(feePaymentSubmissions.invoiceId, invoiceIds))).orderBy(desc(feePaymentSubmissions.submittedAt)).limit(30) : [];
      return NextResponse.json({ ...base, invoices, submissions });
    }

    if (section === "notices") {
      const announcements = await getVisibleAnnouncements({ ...session, role: "STUDENT", userId: child.id }, 30, { campusId: child.campusId, classId: child.classId, sectionId: child.sectionId, createdAt: child.createdAt }, { includeReadStatus: false });
      return NextResponse.json({ ...base, announcements: announcements.filter((item) => pakistanDateKey(item.createdAtIso) >= period.from && pakistanDateKey(item.createdAtIso) <= period.to) });
    }

    const [profile, leaves, support] = await Promise.all([
      db.select({ fatherName: students.fatherName, phone: students.phone, gender: students.gender, loginId: students.loginRollNumber, classRoll: students.classRollNumber, year: students.yearOfJoining, age: students.age, emergency: students.emergencyContact, whatsapp: students.parentalWhatsapp, guardianEmail: students.guardianEmail, status: students.academicStatus }).from(students).where(and(eq(students.institutionId, institutionId), eq(students.id, child.id))).limit(1),
      db.select().from(leaveRequests).where(and(eq(leaveRequests.institutionId, institutionId), eq(leaveRequests.userRole, "STUDENT"), eq(leaveRequests.userId, child.id))).orderBy(desc(leaveRequests.createdAt)).limit(20),
      db.select().from(tickets).where(and(eq(tickets.institutionId, institutionId), eq(tickets.creatorRole, "PARENT"), eq(tickets.creatorId, context.parent.id))).orderBy(desc(tickets.createdAt)).limit(20),
    ]);
    return NextResponse.json({ ...base, profile: profile[0] || null, leaves, support });
  } catch (error) {
    const publicInputError = inputErrorResponse(error);
    if (publicInputError) return NextResponse.json(publicInputError.body, { status: publicInputError.status });

    if (error instanceof ParentChildAccessError) return NextResponse.json({ error: error.message }, { status: 404 });
    console.error("Parent mobile portal error:", error);
    return NextResponse.json({ error: "Could not load parent portal" }, { status: 500 });
  }
});
