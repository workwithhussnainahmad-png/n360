import { NextRequest } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { classes, institutions, sections, students } from "@/db/schema";
import { displaySectionName } from "@/lib/class-section-label";
import { withApiPolicy } from "@/lib/api-policy";
import { withRateLimit } from "@/lib/rate-limit";
import { readStudentVerificationToken } from "@/lib/student-verification-token";
import { serializedJsonResponse } from "@/lib/dashboard-response";

const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };

export const GET = withApiPolicy(async (request: NextRequest) => {
  try {
    const token = readStudentVerificationToken(request.nextUrl.searchParams.get("token") || "");
    if (!token) return serializedJsonResponse({ verified: false }, { headers });
    const limit = await withRateLimit(request, "student_verification");
    if (!limit.success) return serializedJsonResponse({ error: "Too many checks. Please try again shortly." }, { status: 429, headers: { ...headers, "Retry-After": String(limit.retryAfterSeconds) } });
    // Primary-key lookup with tenant and lifecycle checks; no list scans, auth or cache fills.
    const [student] = await db.select({
      name: students.name,
      institution: institutions.name,
      photo: students.profilePictureUrl,
      studentNumber: students.loginRollNumber,
      createdAt: students.createdAt,
      className: classes.name,
      sectionName: sections.name,
      rollNumber: students.classRollNumber,
      academicStatus: students.academicStatus,
      yearOfJoining: students.yearOfJoining,
    }).from(students)
      .innerJoin(institutions, eq(institutions.id, students.institutionId))
      .leftJoin(classes, and(eq(classes.id, students.classId), eq(classes.institutionId, students.institutionId)))
      .leftJoin(sections, and(eq(sections.id, students.sectionId), eq(sections.institutionId, students.institutionId), eq(sections.classId, students.classId)))
      .where(and(eq(students.id, token.studentId), eq(students.institutionId, token.institutionId), eq(students.isActive, true), isNull(students.deletedAt), isNull(institutions.deletedAt)))
      .limit(1);
    if (!student || student.createdAt.getTime() !== token.createdAt) return serializedJsonResponse({ verified: false }, { headers });
    return serializedJsonResponse({ verified: true, checkedAt: new Date().toISOString(), student: {
      name: student.name, institution: student.institution, photo: student.photo,
      studentNumber: student.studentNumber.split("@")[0], className: student.className,
      sectionName: student.sectionName ? displaySectionName(student.sectionName) || "Whole class" : null, rollNumber: student.rollNumber,
      academicStatus: student.academicStatus, yearOfJoining: student.yearOfJoining,
    } }, { headers });
  } catch {
    return serializedJsonResponse({ error: "Verification is temporarily unavailable. Please try again." }, { status: 503, headers });
  }
});
