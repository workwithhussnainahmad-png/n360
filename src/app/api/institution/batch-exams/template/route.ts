import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { students, subjects, staffAssignments, sections } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { eq, and, inArray } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || (session.role !== "INSTITUTION" && session.role !== "INSTITUTION_ADMIN") || !session.institutionId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const classIdStr = searchParams.get("classId");
    const sectionIdStr = searchParams.get("sectionId");

    if (!classIdStr) {
      return NextResponse.json({ error: "classId is required" }, { status: 400 });
    }
    const classId = Number(classIdStr);
    
    // 1. Fetch Students
    const conditions = [
      eq(students.institutionId, session.institutionId),
      eq(students.classId, classId),
      eq(students.isActive, true)
    ];
    if (sectionIdStr) {
      conditions.push(eq(students.sectionId, Number(sectionIdStr)));
    }
    const studentList = await db.select({
      name: students.name,
      rollNumber: students.classRollNumber
    })
    .from(students)
    .where(and(...conditions))
    .orderBy(students.classRollNumber);

    // 2. Fetch Subjects
    const sectionRows = await db.select({ id: sections.id })
      .from(sections)
      .where(and(
        eq(sections.classId, classId),
        eq(sections.institutionId, session.institutionId)
      ));
    const sectionIds = sectionRows.map(s => s.id);
    
    let subjectList: { name: string }[] = [];
    if (sectionIds.length > 0) {
      const timetableSubjects = await db.selectDistinct({
        name: subjects.name
      })
      .from(staffAssignments)
      .innerJoin(subjects, eq(staffAssignments.subjectId, subjects.id))
      .where(and(
        eq(staffAssignments.institutionId, session.institutionId),
        eq(subjects.institutionId, session.institutionId),
        inArray(staffAssignments.sectionId, sectionIds)
      ));

      subjectList = timetableSubjects;
    }

    // fallback to all institution subjects if timetable is empty
    if (subjectList.length === 0) {
      subjectList = await db.select({ name: subjects.name })
        .from(subjects)
        .where(eq(subjects.institutionId, session.institutionId));
    }

    return NextResponse.json({ students: studentList, subjects: subjectList.map(s => s.name) });
  } catch (error: any) {
    console.error("Fetch template error:", error);
    return NextResponse.json({ error: "Failed to fetch template data" }, { status: 500 });
  }
}
