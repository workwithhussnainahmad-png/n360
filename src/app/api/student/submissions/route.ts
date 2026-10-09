import { inputErrorResponse } from '@/lib/input-error-response';
import { NextRequest, NextResponse } from "next/server";
import { saveStudentSubmission } from "@/app/actions/assessment-actions";
import { db } from "@/db";
import { assignments, submissions, students, subjects } from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { getAuthenticatedStudentPlacement } from "@/lib/auth-student";
import { eq, and, desc, inArray, isNull, lt, or } from "drizzle-orm";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

type AssignmentsCursor = { dueAt: Date; id: number };

function parseAssignmentsCursor(value: string | null): AssignmentsCursor | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as {
      dueAt?: unknown;
      id?: unknown;
    };
    const dueAt = new Date(typeof parsed.dueAt === "string" ? parsed.dueAt : "");
    const id = Number(parsed.id);

    if (Number.isNaN(dueAt.getTime()) || !Number.isInteger(id) || id <= 0) {
      return null;
    }

    return { dueAt, id };
  } catch {
    return null;
  }
}

function encodeAssignmentsCursor({ dueAt, id }: AssignmentsCursor) {
  return Buffer.from(JSON.stringify({ dueAt: dueAt.toISOString(), id })).toString("base64url");
}

export const GET = requireRole(["STUDENT"], async (req: NextRequest, { session }) => {
  if (!session.institutionId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const limitParam = Number(req.nextUrl.searchParams.get("limit"));
    const limit = Number.isInteger(limitParam) && limitParam > 0
      ? Math.min(limitParam, MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;
    const cursorParam = req.nextUrl.searchParams.get("cursor");
    const cursor = parseAssignmentsCursor(cursorParam);
    if (cursorParam && !cursor) {
      return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
    }

    const student = getAuthenticatedStudentPlacement(session) ?? (await db
      .select({ classId: students.classId, sectionId: students.sectionId })
      .from(students)
      .where(and(
        eq(students.id, session.userId),
        eq(students.institutionId, session.institutionId)
      ))
      .limit(1))[0];

    if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });

    const assignmentConditions = [
      eq(assignments.classId, student.classId),
      // sectionId can be null if assignment is for whole class, or match student's section
      or(eq(assignments.sectionId, student.sectionId), isNull(assignments.sectionId)),
    ];

    if (cursor) {
      assignmentConditions.push(or(
        lt(assignments.dueAt, cursor.dueAt),
        and(eq(assignments.dueAt, cursor.dueAt), lt(assignments.id, cursor.id))
      ));
    }

    const assignmentPage = await db
      .select({
        id: assignments.id,
        title: assignments.title,
        description: assignments.description,
        referenceFileUrl: assignments.referenceFileUrl,
        referenceFileName: assignments.referenceFileName,
        dueAt: assignments.dueAt,
        subjectName: subjects.name,
      })
      .from(assignments)
      .leftJoin(subjects, eq(assignments.subjectId, subjects.id))
      .where(and(eq(assignments.institutionId, session.institutionId), ...assignmentConditions))
      .orderBy(desc(assignments.dueAt), desc(assignments.id))
      .limit(limit + 1);

    const hasNextPage = assignmentPage.length > limit;
    const studentAssignments = hasNextPage ? assignmentPage.slice(0, limit) : assignmentPage;
    const assignmentIds = studentAssignments.map((assignment) => assignment.id);

    const studentSubmissions = assignmentIds.length
      ? await db.select({
          id: submissions.id,
          assignmentId: submissions.assignmentId,
          fileKey: submissions.fileKey,
          fileUrl: submissions.fileUrl,
          createdAt: submissions.createdAt,
        })
          .from(submissions)
          .where(and(
            eq(submissions.studentId, session.userId),
            eq(submissions.institutionId, session.institutionId),
            inArray(submissions.assignmentId, assignmentIds)
          ))
      : [];

    const submissionMap = new Map(studentSubmissions.map(sub => [sub.assignmentId, sub]));
    const result = studentAssignments.map(a => ({
      ...a,
      submission: submissionMap.has(a.id)
        ? submissionMap.get(a.id)!
        : null,
    }));

    const lastAssignment = studentAssignments.at(-1);
    return NextResponse.json({
      assignments: result,
      nextCursor: hasNextPage && lastAssignment
        ? encodeAssignmentsCursor({ dueAt: lastAssignment.dueAt, id: lastAssignment.id })
        : null,
    });
  } catch (error) {
    const publicInputError = inputErrorResponse(error);
    if (publicInputError) return NextResponse.json(publicInputError.body, { status: publicInputError.status });

    console.error("Error fetching submissions:", error);
    return NextResponse.json({ error: "Failed to fetch submissions" }, { status: 500 });
  }
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const assignmentId = Number(body.assignmentId);
    const fileKey = String(body.fileKey || "").trim();

    if (!Number.isInteger(assignmentId) || assignmentId <= 0 || !fileKey) {
      return NextResponse.json({ error: "Assignment and uploaded file are required" }, { status: 400 });
    }

    await saveStudentSubmission(assignmentId, fileKey);
    return NextResponse.json({ message: "Submission saved" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    const status = message === "Unauthorized" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
