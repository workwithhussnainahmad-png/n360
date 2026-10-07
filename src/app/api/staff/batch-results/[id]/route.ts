import { db } from "@/db";
import { batchExamResults, batchExamSubjects, batchExams, students, subjects, classes, sections } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { eq, and } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session || session.role !== "STAFF" || !session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const subjectId = Number(id);

    // Verify ownership and get subject details
    const [subjectDetails] = await db.select({
      id: batchExamSubjects.id,
      isPublished: batchExamSubjects.isPublished,
      reviewDeadline: batchExamSubjects.reviewDeadline,
      maxMarks: batchExamSubjects.maxMarks,
      subjectName: subjects.name,
      examTitle: batchExams.title,
      examType: batchExams.type,
      className: classes.name,
      sectionName: sections.name,
    })
    .from(batchExamSubjects)
    .innerJoin(subjects, eq(batchExamSubjects.subjectId, subjects.id))
    .innerJoin(batchExams, eq(batchExamSubjects.batchExamId, batchExams.id))
    .innerJoin(classes, eq(batchExams.classId, classes.id))
    .leftJoin(sections, eq(batchExams.sectionId, sections.id))
    .where(
      and(
        eq(batchExamSubjects.id, subjectId),
        eq(batchExamSubjects.staffId, session.userId)
      )
    );

    if (!subjectDetails) {
      return NextResponse.json({ error: "Not found or unauthorized" }, { status: 404 });
    }

    const now = new Date();
    const isEffectivelyPublished = subjectDetails.isPublished || now > subjectDetails.reviewDeadline;

    // Get student results
    const results = await db.select({
      id: batchExamResults.id,
      studentId: batchExamResults.studentId,
      marksObtained: batchExamResults.marksObtained,
      isEdited: batchExamResults.isEdited,
      studentName: students.name,
      rollNumber: students.classRollNumber
    })
    .from(batchExamResults)
    .innerJoin(students, eq(batchExamResults.studentId, students.id))
    .where(eq(batchExamResults.batchExamSubjectId, subjectId));

    return NextResponse.json({
      subject: {
        ...subjectDetails,
        isEffectivelyPublished
      },
      results
    });
  } catch (error: any) {
    console.error("Fetch batch result details error:", error);
    return NextResponse.json({ error: "Failed to fetch details" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session || session.role !== "STAFF" || !session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const subjectId = Number(id);
    const { resultId, newMarks } = await req.json();

    if (!resultId || newMarks === undefined) {
      return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
    }

    // Verify ownership & deadline
    const [subject] = await db.select({
      isPublished: batchExamSubjects.isPublished,
      reviewDeadline: batchExamSubjects.reviewDeadline,
    })
    .from(batchExamSubjects)
    .where(
      and(
        eq(batchExamSubjects.id, subjectId),
        eq(batchExamSubjects.staffId, session.userId)
      )
    );

    if (!subject) return NextResponse.json({ error: "Unauthorized" }, { status: 404 });
    if (subject.isPublished || new Date() > subject.reviewDeadline) {
      return NextResponse.json({ error: "Cannot edit. Deadline passed or already published." }, { status: 400 });
    }

    // Verify result hasn't been edited before
    const [existingResult] = await db.select({ isEdited: batchExamResults.isEdited })
    .from(batchExamResults)
    .where(and(
      eq(batchExamResults.id, resultId),
      eq(batchExamResults.batchExamSubjectId, subjectId)
    ));

    if (!existingResult) return NextResponse.json({ error: "Result not found" }, { status: 404 });
    if (existingResult.isEdited) return NextResponse.json({ error: "Result can only be edited once" }, { status: 400 });

    // Update
    await db.update(batchExamResults)
      .set({ marksObtained: newMarks, isEdited: true })
      .where(and(
        eq(batchExamResults.id, resultId),
        eq(batchExamResults.batchExamSubjectId, subjectId)
      ));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Update batch result error:", error);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Publish
  try {
    const session = await getSession();
    if (!session || session.role !== "STAFF" || !session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const subjectId = Number(id);

    const [subject] = await db.update(batchExamSubjects)
      .set({ isPublished: true, publishedAt: new Date() })
      .where(
        and(
          eq(batchExamSubjects.id, subjectId),
          eq(batchExamSubjects.staffId, session.userId)
        )
      ).returning();

    if (!subject) return NextResponse.json({ error: "Not found or unauthorized" }, { status: 404 });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Publish batch result error:", error);
    return NextResponse.json({ error: "Failed to publish" }, { status: 500 });
  }
}
