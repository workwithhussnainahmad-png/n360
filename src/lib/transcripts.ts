import { db } from "@/db";
import { batchExamResults, batchExamSubjects } from "@/db/schema";
import { and, eq, or, sql } from "drizzle-orm";

/**
 * Lightweight existence check for "does this student have any transcript to view" —
 * used by nav-availability and the dashboard flag. Approximates the full
 * /api/student/transcripts publish logic (which requires every subject on an
 * exam to be published) with a single-row published-subject check, which is
 * sufficient for a boolean nav hint.
 */
export async function hasVisibleTranscript(studentId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: batchExamResults.id })
    .from(batchExamResults)
    .innerJoin(batchExamSubjects, eq(batchExamResults.batchExamSubjectId, batchExamSubjects.id))
    .where(and(
      eq(batchExamResults.studentId, studentId),
      or(eq(batchExamSubjects.isPublished, true), sql`now() > ${batchExamSubjects.reviewDeadline}`)
    ))
    .limit(1);

  return !!row;
}
