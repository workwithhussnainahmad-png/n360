import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { campuses, classes, institutions, sections, studentPromotions, students } from "@/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { requireRole, getTenantContext } from "@/lib/rbac";
import { invalidateUserValidity } from "@/lib/user";
import { invalidateInstitutionRosterCaches } from "@/lib/redis";
import { getClientIp } from "@/lib/client-ip";
import { prepareParentActivation, syncStudentGuardian } from "@/lib/parent-identity";
import { ZodError } from "zod";
import { enqueueEmail } from "@/lib/email-outbox";
import { ParentAccountActivationEmail, ParentStudentLinkedEmail } from "@/lib/email";
import { revokeAllSessions } from "@/lib/auth";

export const GET = requireRole(["INSTITUTION", "INSTITUTION_ADMIN"], async (_req: NextRequest, { params, session }) => {
  const { id } = await params;
  const tenantId = getTenantContext(session);
  const studentId = parseInt(id);

  if (isNaN(studentId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const [student] = await db.select({
    id: students.id,
    name: students.name,
    fatherName: students.fatherName,
    gender: students.gender,
    loginRollNumber: students.loginRollNumber,
    classRollNumber: students.classRollNumber,
    profilePictureUrl: students.profilePictureUrl,
    emergencyContact: students.emergencyContact,
    parentalWhatsapp: students.parentalWhatsapp,
    guardianEmail: students.guardianEmail,
    yearOfJoining: students.yearOfJoining,
    phone: students.phone,
    age: students.age,
    campusId: students.campusId,
    campusName: campuses.name,
    className: classes.name,
    sectionName: sections.name,
  })
    .from(students)
    .innerJoin(classes, eq(students.classId, classes.id))
    .innerJoin(sections, eq(students.sectionId, sections.id))
    .leftJoin(campuses, eq(students.campusId, campuses.id))
    .where(and(eq(students.id, studentId), eq(students.institutionId, tenantId)))
    .limit(1);

  if (!student) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }

  const promotionHistory = await db.select({
    id: studentPromotions.id,
    fromClassId: studentPromotions.fromClassId,
    toClassId: studentPromotions.toClassId,
    status: studentPromotions.status,
    fromRollNumber: studentPromotions.fromRollNumber,
    toRollNumber: studentPromotions.toRollNumber,
    createdAt: studentPromotions.createdAt,
  })
    .from(studentPromotions)
    .where(and(eq(studentPromotions.studentId, studentId), eq(studentPromotions.institutionId, tenantId)))
    .orderBy(desc(studentPromotions.createdAt));

  const historyClassIds = [...new Set(
    promotionHistory.flatMap((row) => [row.fromClassId, row.toClassId].filter((value): value is number => value !== null))
  )];
  const historyClasses = historyClassIds.length
    ? await db.select({ id: classes.id, name: classes.name })
      .from(classes)
      .where(and(eq(classes.institutionId, tenantId), inArray(classes.id, historyClassIds)))
    : [];
  const historyClassNames = new Map(historyClasses.map((row) => [row.id, row.name]));

  return NextResponse.json({
    student: {
      ...student,
      promotionHistory: promotionHistory.map((row) => ({
        ...row,
        fromClassName: historyClassNames.get(row.fromClassId) || "Previous class",
        toClassName: row.status === "GRADUATED" ? "Graduated" : historyClassNames.get(row.toClassId || 0) || "Current class",
        createdAt: row.createdAt.toISOString(),
      })),
    },
  });
});

export const PATCH = requireRole(["INSTITUTION", "INSTITUTION_ADMIN"], async (req: NextRequest, { params, session }) => {
  const { id } = await params;
  const tenantId = getTenantContext(session);
  const studentId = parseInt(id);

  if (isNaN(studentId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const body = await req.json();

  try {
    const classId = parseInt(body.classId);
    const sectionId = parseInt(body.sectionId);
    if (!Number.isInteger(classId) || !Number.isInteger(sectionId)) {
      return NextResponse.json({ error: "Valid class and section are required" }, { status: 400 });
    }

    const [student] = await db.select({
      id: students.id,
      name: students.name,
      institutionId: students.institutionId,
      yearOfJoining: students.yearOfJoining,
      gender: students.gender,
      classRollNumber: students.classRollNumber,
    })
      .from(students)
      .where(and(eq(students.id, studentId), eq(students.institutionId, tenantId)))
      .limit(1);
    if (!student) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    const classRollNumber = String(body.classRollNumber || student.classRollNumber).trim();
    if (!classRollNumber) {
      return NextResponse.json({ error: "Class roll number is required" }, { status: 400 });
    }

    const [classRow] = await db.select().from(classes).where(and(eq(classes.id, classId), eq(classes.institutionId, tenantId))).limit(1);
    const [sectionRow] = await db.select().from(sections).where(and(eq(sections.id, sectionId), eq(sections.institutionId, tenantId))).limit(1);
    if (!classRow || !sectionRow || sectionRow.classId !== classId) {
      return NextResponse.json({ error: "Class or section not found" }, { status: 400 });
    }

    const hasGuardianEmail = Object.prototype.hasOwnProperty.call(
      body,
      "guardianEmail",
    );
    const parentActivation = hasGuardianEmail
      ? await prepareParentActivation(tenantId, body.guardianEmail)
      : null;
    const { updated, parentLink } = await db.transaction(async (tx) => {
      const [updatedStudent] = await tx.update(students)
        .set({
          name: body.name,
          classId,
          sectionId,
          classRollNumber,
          phone: body.phone || null
        })
        .where(and(
          eq(students.id, student.id),
          eq(students.institutionId, tenantId),
        ))
        .returning({ id: students.id });

      const parentLink = updatedStudent && hasGuardianEmail
        ? await syncStudentGuardian(tx, {
          institutionId: tenantId,
          studentId: updatedStudent.id,
          guardianEmail: body.guardianEmail,
          actorId: session.userId,
          actorRole: session.role,
          ip: getClientIp(req),
          activation: parentActivation,
        })
        : null;
      return { updated: updatedStudent, parentLink };
    });

    if (!updated) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    if (parentLink?.guardianEmail) {
      const [institution] = await db
        .select({ name: institutions.name, username: institutions.username, logoKey: institutions.logoKey })
        .from(institutions)
        .where(eq(institutions.id, tenantId))
        .limit(1);
      if (institution) {
        if (parentLink.activation) {
          await enqueueEmail({
            institutionId: tenantId,
            to: parentLink.guardianEmail,
            subject: `Parent account credentials - ${institution.name}`,
            html: ParentAccountActivationEmail({
              institutionName: institution.name,
              institutionLogoUrl: institution.logoKey,
              studentName: body.name || student.name,
              institutionUsername: institution.username,
              guardianEmail: parentLink.guardianEmail,
              temporaryPassword: parentLink.activation.temporaryPassword,
            }),
            dedupeKey: `parent:${parentLink.parentId}:initial-activation`,
          });
        } else if (parentLink.newlyLinked) {
          await enqueueEmail({
            institutionId: tenantId,
            to: parentLink.guardianEmail,
            subject: `New student linked - ${institution.name}`,
            html: ParentStudentLinkedEmail({
              institutionName: institution.name,
              institutionLogoUrl: institution.logoKey,
              studentName: body.name || student.name,
              guardianEmail: parentLink.guardianEmail,
            }),
            dedupeKey: `parent:${parentLink.parentId}:student-link:${studentId}`,
          });
        }
      }
    }
    if (parentLink?.disabledParentId) {
      await Promise.all([
        invalidateUserValidity("PARENT", parentLink.disabledParentId),
        revokeAllSessions("PARENT", parentLink.disabledParentId),
      ]);
    } else if (parentLink?.parentId) {
      await invalidateUserValidity("PARENT", parentLink.parentId);
    }

    await invalidateInstitutionRosterCaches(tenantId);
    return NextResponse.json({ message: "Student updated successfully" });
  } catch (err: any) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message || "Invalid guardian email" },
        { status: 400 },
      );
    }

    const isDuplicate = err?.code === '23505' || err?.cause?.code === '23505';
    if (isDuplicate) {
      return NextResponse.json({ error: "Login roll number or class roll number already exists" }, { status: 409 });
    }
    console.error("Error updating student:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
});

export const DELETE = requireRole(["INSTITUTION", "INSTITUTION_ADMIN"], async (req: NextRequest, { params, session }) => {
  const { id } = await params;
  const tenantId = getTenantContext(session);
  const studentId = parseInt(id);

  if (isNaN(studentId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  try {
    const { deleted, parentLink } = await db.transaction(async (tx) => {
      const parentLink = await syncStudentGuardian(tx, {
        institutionId: tenantId,
        studentId,
        guardianEmail: null,
        actorId: session.userId,
        actorRole: session.role,
        ip: getClientIp(req),
      });
      const [deletedStudent] = await tx.delete(students)
        .where(and(eq(students.id, studentId), eq(students.institutionId, tenantId)))
        .returning({ id: students.id });
      return { deleted: deletedStudent, parentLink };
    });

    if (!deleted) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    if (parentLink.disabledParentId) {
      await Promise.all([
        invalidateUserValidity("PARENT", parentLink.disabledParentId),
        revokeAllSessions("PARENT", parentLink.disabledParentId),
      ]);
    }

    await invalidateUserValidity("STUDENT", deleted.id);
    await invalidateInstitutionRosterCaches(tenantId);

    return NextResponse.json({ message: "Student deleted successfully" });
  } catch (error) {
    console.error("Error deleting student:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
});
