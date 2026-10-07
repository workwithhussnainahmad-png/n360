import { db } from "../src/db";
import {
  institutions,
  staff,
  students,
  sections,
  classes,
  subjects,
  attendances,
  staffAttendances,
  batchExams,
  batchExamSubjects,
  batchExamResults,
} from "../src/db/schema";
import { eq } from "drizzle-orm";

async function seed() {
  console.log("Seeding mock data...");
  const instList = await db.select().from(institutions).limit(1);
  if (!instList.length) {
    console.error("No institutions found");
    return;
  }
  const institutionId = instList[0].id;
  console.log(`Using institution ID: ${institutionId}`);

  const allStaff = await db.select().from(staff).where(eq(staff.institutionId, institutionId));
  const allStudents = await db.select().from(students).where(eq(students.institutionId, institutionId));
  const allClasses = await db.select().from(classes).where(eq(classes.institutionId, institutionId));
  const allSections = await db.select().from(sections).where(eq(sections.institutionId, institutionId));
  const allSubjects = await db.select().from(subjects).where(eq(subjects.institutionId, institutionId));

  console.log(`Found ${allStaff.length} staff, ${allStudents.length} students, ${allClasses.length} classes, ${allSections.length} sections.`);

  // Dates for past 7 days
  const dates: string[] = [];
  for (let i = 1; i <= 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split("T")[0]);
  }

  const staffAtt: { institutionId: number; staffId: number; date: string; status: "PRESENT" | "ABSENT" }[] = [];
  for (const date of dates) {
    for (const member of allStaff) {
      staffAtt.push({
        institutionId,
        staffId: member.id,
        date,
        status: Math.random() > 0.1 ? "PRESENT" : "ABSENT",
      });
    }
  }

  const studentAtt: { institutionId: number; studentId: number; sectionId: number; date: string; status: "PRESENT" | "ABSENT" }[] = [];
  for (const date of dates) {
    for (const student of allStudents) {
      if (student.sectionId) {
        studentAtt.push({
          institutionId,
          studentId: student.id,
          sectionId: student.sectionId,
          date,
          status: Math.random() > 0.1 ? "PRESENT" : "ABSENT",
        });
      }
    }
  }

  try {
    if (staffAtt.length) {
      await db.insert(staffAttendances).values(staffAtt).onConflictDoNothing();
      console.log(`Inserted ${staffAtt.length} staff attendance records.`);
    }
    if (studentAtt.length) {
      await db.insert(attendances).values(studentAtt).onConflictDoNothing();
      console.log(`Inserted ${studentAtt.length} student attendance records.`);
    }
  } catch (e: any) {
    console.error("Error inserting attendance:", e.message);
  }

  // Create a batch exam for the first class if classes exist
  if (allClasses.length > 0 && allSections.length > 0) {
    const classId = allClasses[0].id;
    const section = allSections.find(s => s.classId === classId);

    if (section) {
      try {
        const [exam] = await db
          .insert(batchExams)
          .values({
            institutionId,
            classId,
            sectionId: section.id,
            title: "Mock Midterm Exam",
            type: "MID",
          })
          .returning();

        let subjectId = null;
        if (allSubjects.length > 0) {
          subjectId = allSubjects[0].id;
        } else {
          // Create dummy subject
          const [subj] = await db.insert(subjects).values({ institutionId, name: "Mathematics" }).returning();
          subjectId = subj.id;
        }

        const [examSubj] = await db
          .insert(batchExamSubjects)
          .values({
            batchExamId: exam.id,
            subjectId,
            maxMarks: 100,
            staffId: allStaff.length > 0 ? allStaff[0].id : null,
            reviewDeadline: new Date(Date.now() + 86400000 * 7),
          })
          .returning();

        const results = [];
        for (const student of allStudents.filter(s => s.classId === classId)) {
          results.push({
            batchExamSubjectId: examSubj.id,
            studentId: student.id,
            marksObtained: Math.floor(Math.random() * 60) + 40,
            status: "PRESENT",
          });
        }

        if (results.length) {
          await db.insert(batchExamResults).values(results);
          console.log(`Inserted ${results.length} exam results for class ${classId}.`);
        }
      } catch (e: any) {
        console.error("Error inserting exams:", e);
      }
    }
  }

  console.log("Mock data seed complete.");
  process.exit(0);
}

seed().catch(console.error);
