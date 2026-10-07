import { NextResponse } from 'next/server';
import { db } from '@/db';
import { classes, institutions, sections, students } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireRole } from '@/lib/rbac';

export const GET = requireRole(['STUDENT'], async (_req, { session }) => {
  const studentId = session.userId;

  const [row] = await db
    .select({
      id: students.id,
      name: students.name,
      fatherName: students.fatherName,
      phone: students.phone,
      emergencyContact: students.emergencyContact,
      profilePictureUrl: students.profilePictureUrl,
      loginRollNumber: students.loginRollNumber,
      classRollNumber: students.classRollNumber,
      className: classes.name,
      sectionName: sections.name,
      institutionId: students.institutionId,
    })
    .from(students)
    .innerJoin(classes, eq(students.classId, classes.id))
    .innerJoin(sections, eq(students.sectionId, sections.id))
    .where(eq(students.id, studentId))
    .limit(1);

  if (!row) return NextResponse.json({ error: 'Student not found' }, { status: 404 });

  const [inst] = await db
    .select({
      name: institutions.name,
      logoKey: institutions.logoKey,
      signatureKey: institutions.signatureKey,
    })
    .from(institutions)
    .where(eq(institutions.id, row.institutionId))
    .limit(1);

  if (!inst) return NextResponse.json({ error: 'Institution not found' }, { status: 404 });

  return NextResponse.json({ student: row, institution: inst });
});
