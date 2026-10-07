import { NextResponse } from "next/server";
import { db } from "@/db";
import { diaries, subjects, staff, students } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { eq, and } from "drizzle-orm";

export async function GET(req: Request) {
  try {
    const session = await getSession();
    if (!session || session.role !== "STUDENT") {
      return NextResponse.json({ error: "Forbidden: Not a student" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const dateStr = searchParams.get("date");

    if (!dateStr) {
      return NextResponse.json({ error: "Date is required" }, { status: 400 });
    }

    // Get the student's classId
    const studentRecords = await db.select({ classId: students.classId })
      .from(students)
      .where(eq(students.id, session.userId));
      
    if (studentRecords.length === 0) {
      return NextResponse.json({ error: "Student record not found" }, { status: 404 });
    }
    
    const classId = studentRecords[0].classId;

    const entries = await db.select({
      id: diaries.id,
      content: diaries.content,
      date: diaries.date,
      subjectName: subjects.name,
      staffName: staff.name,
    })
    .from(diaries)
    .leftJoin(subjects, eq(diaries.subjectId, subjects.id))
    .leftJoin(staff, eq(diaries.staffId, staff.id))
    .where(and(
      eq(diaries.institutionId, session.institutionId!),
      eq(diaries.classId, classId),
      eq(diaries.date, dateStr)
    ));

    return NextResponse.json(entries);
  } catch (error) {
    console.error("Error fetching student diaries:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
