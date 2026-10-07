import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { onlineTestSubmissions, onlineTests, tests } from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { and, eq } from "drizzle-orm";

export const GET = requireRole(["STAFF"], async (_req: NextRequest, { session, params }) => {
  if (!session.institutionId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, submissionId } = await params;
  const onlineTestId = Number(id);
  const parsedSubmissionId = Number(submissionId);
  if (!Number.isInteger(onlineTestId) || onlineTestId <= 0 || !Number.isInteger(parsedSubmissionId) || parsedSubmissionId <= 0) {
    return NextResponse.json({ error: "Invalid hosted test or submission ID" }, { status: 400 });
  }

  const [submission] = await db.select({
    id: onlineTestSubmissions.id,
    answers: onlineTestSubmissions.answers,
  })
    .from(onlineTestSubmissions)
    .innerJoin(onlineTests, eq(onlineTestSubmissions.onlineTestId, onlineTests.id))
    .innerJoin(tests, eq(onlineTests.testId, tests.id))
    .where(and(
      eq(onlineTestSubmissions.id, parsedSubmissionId),
      eq(onlineTestSubmissions.onlineTestId, onlineTestId),
      eq(onlineTestSubmissions.institutionId, session.institutionId),
      eq(onlineTests.institutionId, session.institutionId),
      eq(tests.institutionId, session.institutionId),
      eq(tests.staffId, session.userId)
    ))
    .limit(1);

  if (!submission) return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  return NextResponse.json({ id: submission.id, answers: submission.answers });
});
