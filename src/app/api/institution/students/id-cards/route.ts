import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { classes, institutions, sections, students } from '@/db/schema';
import { getTenantContext, requireRole } from '@/lib/rbac';

const MAX_STUDENT_IDS = 200;

export const GET = requireRole(['INSTITUTION', 'INSTITUTION_ADMIN'], async (req: NextRequest, { session }) => {
  const institutionId = getTenantContext(session);
  const rawIds = new URL(req.url).searchParams.get('studentIds');
  const studentIds = rawIds ? rawIds.split(',').map(Number).filter(Number.isInteger) : [];
  if (studentIds.length === 0) {
    return NextResponse.json({ error: `studentIds is required (comma-separated, max ${MAX_STUDENT_IDS})` }, { status: 400 });
  }
  if (studentIds.length > MAX_STUDENT_IDS) {
    return NextResponse.json({ error: `A maximum of ${MAX_STUDENT_IDS} studentIds is allowed per request` }, { status: 400 });
  }
  const [institution, rows] = await Promise.all([
    db.select({ id: institutions.id, name: institutions.name, logoKey: institutions.logoKey, signatureKey: institutions.signatureKey, address: institutions.address, contactPhone: institutions.contactPhone })
      .from(institutions).where(eq(institutions.id, institutionId)).limit(1),
    db.select({ id: students.id, name: students.name, fatherName: students.fatherName, phone: students.phone, emergencyContact: students.emergencyContact, profilePictureUrl: students.profilePictureUrl, loginRollNumber: students.loginRollNumber, classRollNumber: students.classRollNumber, className: classes.name, sectionName: sections.name })
      .from(students).innerJoin(classes, eq(students.classId, classes.id)).innerJoin(sections, eq(students.sectionId, sections.id))
      .where(and(eq(students.institutionId, institutionId), eq(students.isActive, true), inArray(students.id, studentIds))),
  ]);
  if (!institution[0]) return NextResponse.json({ error: 'Institution not found' }, { status: 404 });
  return NextResponse.json({ institution: institution[0], students: rows });
});
