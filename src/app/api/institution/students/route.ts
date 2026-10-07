import { after, NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { students, institutions, campuses, classes, sections } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { hashPassword as hash } from '@/lib/argon2-pool';
import { requireRole, getTenantContext } from '@/lib/rbac';
import { createStudentSchema } from '@/lib/validators/student';
import { logAudit } from '@/lib/audit';
import { getClientIp } from '@/lib/client-ip';
import { generateStudentLoginRollNumber } from '@/lib/login-identifiers';
import { resolveStudentLoginInstitution } from '@/lib/student-login-institution';
import { allocateAdmissionSequences } from '@/lib/admission-sequences';
import { prepareParentActivation, syncStudentGuardian } from '@/lib/parent-identity';
import { enqueueEmail } from '@/lib/email-outbox';
import { ParentAccountActivationEmail, ParentStudentLinkedEmail } from '@/lib/email';
import { invalidateUserValidity } from '@/lib/user';
import { ZodError } from 'zod';

const WHOLE_CLASS_SECTION_NAME = "Whole Class";

async function getOrCreateWholeClassSection(institutionId: number, classId: number) {
  const [existingSection] = await db.select({
    id: sections.id,
    classId: sections.classId,
    name: sections.name,
  })
    .from(sections)
    .where(and(
      eq(sections.classId, classId),
      eq(sections.institutionId, institutionId),
      eq(sections.name, WHOLE_CLASS_SECTION_NAME)
    ))
    .limit(1);

  if (existingSection) return existingSection;

  const [createdSection] = await db.insert(sections).values({
    institutionId,
    classId,
    name: WHOLE_CLASS_SECTION_NAME,
    classTeacherId: null,
  }).returning({
    id: sections.id,
    classId: sections.classId,
    name: sections.name,
  });

  return createdSection;
}

export const POST = requireRole(['INSTITUTION', 'INSTITUTION_ADMIN'], async (req: NextRequest, { session }) => {
  try {
    const tenantId = getTenantContext(session);
    const body = await req.json();
    const parsed = createStudentSchema.safeParse(body);
    
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const { firstName, lastName, campusId: requestedCampusId, classId, sectionId, gender, yearOfJoining, classRollNumber, phone, age, guardianEmail } = parsed.data;
    const campusId = session.campusId ?? requestedCampusId;
    if (requestedCampusId && requestedCampusId !== campusId) return NextResponse.json({ error: 'Select your own campus.' }, { status: 400 });

    const [[inst], [classObj], sectionRows, campusRows] = await Promise.all([
      db.select({
        id: institutions.id,
        type: institutions.type,
        username: institutions.username,
        parentInstitutionId: institutions.parentInstitutionId,
        campusName: institutions.campusName,
        name: institutions.name,
        logoKey: institutions.logoKey,
      }).from(institutions).where(eq(institutions.id, tenantId)).limit(1),
      db.select({
        id: classes.id,
        name: classes.name,
      }).from(classes).where(and(eq(classes.id, classId), eq(classes.institutionId, tenantId))).limit(1),
      sectionId ? db.select({
        id: sections.id,
        classId: sections.classId,
        name: sections.name,
      }).from(sections).where(and(eq(sections.id, sectionId), eq(sections.institutionId, tenantId))).limit(1) : Promise.resolve([]),
      campusId ? db.select({ id: campuses.id })
        .from(campuses)
        .where(and(eq(campuses.id, campusId), eq(campuses.institutionId, tenantId)))
        .limit(1) : Promise.resolve([]),
    ]);

    if (!inst) {
      return NextResponse.json({ error: "Institution not found" }, { status: 404 });
    }

    if (!classObj) {
      return NextResponse.json({ error: "Class not found" }, { status: 400 });
    }
    if (campusId && !campusRows[0]) {
      return NextResponse.json({ error: "Campus not found" }, { status: 400 });
    }

    const sectionObj = sectionRows[0] ?? await getOrCreateWholeClassSection(tenantId, classId);

    if (!sectionObj || sectionObj.classId !== classId) {
      return NextResponse.json({ error: "Section not found for selected class" }, { status: 400 });
    }

    const loginInstitution = await resolveStudentLoginInstitution(inst);
    const [admissionSequence] = await allocateAdmissionSequences(tenantId, yearOfJoining);
    const loginRollNumber = generateStudentLoginRollNumber({ institution: loginInstitution, yearOfJoining, admissionSequence });

    const initialPassword = '1234567890';
    const passwordHash = await hash(initialPassword);
    const name = `${firstName} ${lastName}`.trim();
    
    const parentActivation = guardianEmail
      ? await prepareParentActivation(tenantId, guardianEmail)
      : null;

    const { newStudent, parentLink } = await db.transaction(async (tx) => {
      const [created] = await tx.insert(students).values({
        institutionId: tenantId,
        campusId,
        name,
        gender,
        loginRollNumber,
        passwordHash,
        classId,
        sectionId: sectionObj.id,
        yearOfJoining,
        admissionSequence,
        classRollNumber,
        phone,
        age,
        guardianEmail: guardianEmail?.trim().toLowerCase() || null,
        mustChangePassword: true,
        isActive: true,
      }).returning({ id: students.id });

      const parentLink = guardianEmail
        ? await syncStudentGuardian(tx, {
          institutionId: tenantId,
          studentId: created.id,
          guardianEmail,
          guardianPhone: phone || null,
          actorId: session.userId,
          actorRole: session.role,
          ip: getClientIp(req),
          activation: parentActivation,
        })
        : null;
        
      return { newStudent: created, parentLink };
    });

    if (parentLink?.guardianEmail) {
      if (parentLink.activation) {
        await enqueueEmail({
          institutionId: tenantId,
          to: parentLink.guardianEmail,
          subject: `Parent account credentials - ${inst.name}`,
          html: ParentAccountActivationEmail({
            institutionName: inst.name,
            institutionLogoUrl: inst.logoKey,
            studentName: name,
            institutionUsername: inst.username,
            guardianEmail: parentLink.guardianEmail,
            temporaryPassword: parentLink.activation.temporaryPassword,
          }),
          dedupeKey: `parent:${parentLink.parentId}:initial-activation`,
        });
      } else if (parentLink.newlyLinked) {
        await enqueueEmail({
          institutionId: tenantId,
          to: parentLink.guardianEmail,
          subject: `New student linked - ${inst.name}`,
          html: ParentStudentLinkedEmail({
            institutionName: inst.name,
            institutionLogoUrl: inst.logoKey,
            studentName: name,
            guardianEmail: parentLink.guardianEmail,
          }),
          dedupeKey: `parent:${parentLink.parentId}:student-link:${newStudent.id}`,
        });
      }
    }
    
    if (parentLink?.parentId) {
      await invalidateUserValidity('PARENT', parentLink.parentId);
    }

    const { invalidateInstitutionRosterCaches } = await import('@/lib/redis');
    await invalidateInstitutionRosterCaches(tenantId);

    after(async () => {
      try {
        await logAudit({
          institutionId: tenantId,
          actorId: session.userId,
          actorRole: session.role,
          action: 'CREATE_STUDENT',
          target: `Student ${newStudent.id}`,
          ip: getClientIp(req),
        });
      } catch (auditError) {
        console.error("Create student audit failed:", auditError);
      }
    });

    return NextResponse.json({ 
      message: 'Student created successfully', 
      credentials: { loginRollNumber, initialPassword } 
    }, { status: 201 });
  } catch (err: any) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message || 'Invalid guardian email' }, { status: 400 });
    }
    const isDuplicate = err?.code === '23505' || err?.cause?.code === '23505';
    if (isDuplicate) {
      return NextResponse.json({ error: 'Login roll number or class roll number already exists' }, { status: 409 });
    }
    console.error("Create student failed:", err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
});
