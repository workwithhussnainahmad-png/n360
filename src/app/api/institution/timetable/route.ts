import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { staffAssignments, staff, sections, classes, subjects } from "@/db/schema";
import { eq, and, lt, gt, isNull } from "drizzle-orm";
import { requireRole, getTenantContext } from "@/lib/rbac";

import { invalidateTimetableReadCaches } from "@/lib/redis";
import { invalidateInstitutionAcademicsCache } from "@/lib/institution-academics-data";

export const GET = requireRole(["INSTITUTION", "INSTITUTION_ADMIN"], async (req: NextRequest, { session }) => {
  const institutionId = getTenantContext(session);
  const url = new URL(req.url);

  if (url.searchParams.get("metadata") === "true") {
    const [allStaff, allSections, allClasses, allSubjects] = await Promise.all([
      db.select({ id: staff.id, name: staff.name }).from(staff).where(and(eq(staff.institutionId, institutionId), isNull(staff.deletedAt))),
      db.select({ id: sections.id, name: sections.name, classId: sections.classId, classTeacherId: sections.classTeacherId }).from(sections).where(and(eq(sections.institutionId, institutionId), isNull(sections.deletedAt))),
      db.select({ id: classes.id, name: classes.name }).from(classes).where(and(eq(classes.institutionId, institutionId), isNull(classes.deletedAt))),
      db.select({ id: subjects.id, name: subjects.name }).from(subjects).where(and(eq(subjects.institutionId, institutionId), isNull(subjects.deletedAt))),
    ]);
    return NextResponse.json({ allStaff, allSections, allClasses, allSubjects });
  }

  const assignments = await db.select({
    id: staffAssignments.id,
    dayOfWeek: staffAssignments.dayOfWeek,
    startTime: staffAssignments.startTime,
    endTime: staffAssignments.endTime,
    isBreak: staffAssignments.isBreak,
    sectionId: staffAssignments.sectionId,
    staffId: staffAssignments.staffId,
    subjectId: staffAssignments.subjectId,
    teacher: staff.name,
    subject: subjects.name,
  }).from(staffAssignments)
    .leftJoin(staff, eq(staffAssignments.staffId, staff.id))
    .leftJoin(subjects, eq(staffAssignments.subjectId, subjects.id))
    .where(eq(staffAssignments.institutionId, institutionId));

  return NextResponse.json({ assignments });
});

export const POST = requireRole(["INSTITUTION", "INSTITUTION_ADMIN"], async (req: NextRequest, { session }) => {
  const institutionId = getTenantContext(session);
  
  try {
    const body = await req.json();
    
    // Support assigning Incharge
    if (body.action === "updateIncharge") {
      const sectionId = body.sectionId ? Number(body.sectionId) : null;
      const classId = body.classId ? Number(body.classId) : null;
      const classTeacherId = body.classTeacherId ? Number(body.classTeacherId) : null;

      if (body.sectionId && !Number.isInteger(sectionId)) return NextResponse.json({ error: "Invalid section ID" }, { status: 400 });
      if (body.classId && !Number.isInteger(classId)) return NextResponse.json({ error: "Invalid class ID" }, { status: 400 });
      if (body.classTeacherId && !Number.isInteger(classTeacherId)) return NextResponse.json({ error: "Invalid staff ID" }, { status: 400 });

      if (classTeacherId) {
        const [teacher] = await db.select({ id: staff.id }).from(staff)
          .where(and(eq(staff.id, classTeacherId), eq(staff.institutionId, institutionId), isNull(staff.deletedAt)))
          .limit(1);
        if (!teacher) return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
      }
      
      if (sectionId) {
        const updated = await db.update(sections)
          .set({ classTeacherId: classTeacherId || null })
          .where(and(eq(sections.id, sectionId), eq(sections.institutionId, institutionId), isNull(sections.deletedAt)))
          .returning({ id: sections.id });
        if (updated.length === 0) return NextResponse.json({ error: "Section not found" }, { status: 404 });
      } else if (classId) {
        const [wholeClassSection] = await db.select().from(sections)
          .where(and(eq(sections.classId, classId), eq(sections.name, "Whole Class"), eq(sections.institutionId, institutionId), isNull(sections.deletedAt)))
          .limit(1);
        if (wholeClassSection) {
          await db.update(sections)
            .set({ classTeacherId: classTeacherId || null })
            .where(eq(sections.id, wholeClassSection.id));
        } else {
          return NextResponse.json({ error: "Whole Class section not found" }, { status: 404 });
        }
      } else {
        return NextResponse.json({ error: "Section or class is required" }, { status: 400 });
      }
      await invalidateInstitutionAcademicsCache(institutionId);
      return NextResponse.json({ success: true });
    }

    const { sectionId, dayOfWeek, startTime, endTime, isBreak, staffId, subjectId } = body;

    if (!Number.isInteger(sectionId)) return NextResponse.json({ error: "Invalid section ID" }, { status: 400 });

    const day = Number(dayOfWeek);
    const resolvedStaffId = staffId ? Number(staffId) : null;
    const resolvedSubjectId = subjectId ? Number(subjectId) : null;
    const validTime = /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;
    if (!Number.isInteger(day) || day < 1 || day > 6 || typeof startTime !== "string" || typeof endTime !== "string" || !validTime.test(startTime) || !validTime.test(endTime) || startTime >= endTime) {
      return NextResponse.json({ error: "Provide a valid Monday to Saturday time slot" }, { status: 400 });
    }
    if (!isBreak && (!Number.isInteger(resolvedStaffId) || !Number.isInteger(resolvedSubjectId))) {
      return NextResponse.json({ error: "Teacher and subject are required for class periods" }, { status: 400 });
    }

    const [section] = await db.select({ id: sections.id }).from(sections)
      .where(and(eq(sections.id, sectionId), eq(sections.institutionId, institutionId), isNull(sections.deletedAt)))
      .limit(1);
    if (!section) return NextResponse.json({ error: "Section not found" }, { status: 404 });

    if (resolvedStaffId) {
      const [teacher] = await db.select({ id: staff.id }).from(staff)
        .where(and(eq(staff.id, resolvedStaffId), eq(staff.institutionId, institutionId), isNull(staff.deletedAt)))
        .limit(1);
      if (!teacher) return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
    }
    if (resolvedSubjectId) {
      const [subject] = await db.select({ id: subjects.id }).from(subjects)
        .where(and(eq(subjects.id, resolvedSubjectId), eq(subjects.institutionId, institutionId), isNull(subjects.deletedAt)))
        .limit(1);
      if (!subject) return NextResponse.json({ error: "Subject not found" }, { status: 404 });
    }

    const sectionConflicts = await db.select({ id: staffAssignments.id })
      .from(staffAssignments)
      .where(and(
        eq(staffAssignments.institutionId, institutionId),
        eq(staffAssignments.sectionId, sectionId),
        eq(staffAssignments.dayOfWeek, day),
        lt(staffAssignments.startTime, endTime),
        gt(staffAssignments.endTime, startTime),
      ))
      .limit(1);
    if (sectionConflicts.length > 0) {
      return NextResponse.json({ error: "This section already has a timetable entry in that time range" }, { status: 409 });
    }

    if (resolvedStaffId) {
      const staffConflicts = await db.select({ id: staffAssignments.id })
        .from(staffAssignments)
        .where(and(
          eq(staffAssignments.institutionId, institutionId),
          eq(staffAssignments.staffId, resolvedStaffId),
          eq(staffAssignments.dayOfWeek, day),
          lt(staffAssignments.startTime, endTime),
          gt(staffAssignments.endTime, startTime),
        ))
        .limit(1);
      if (staffConflicts.length > 0) {
        return NextResponse.json({ error: "This staff member is already booked in that time range" }, { status: 409 });
      }
    }

    const [inserted] = await db.insert(staffAssignments).values({
      institutionId,
      sectionId,
      dayOfWeek: day,
      startTime,
      endTime,
      isBreak: Boolean(isBreak),
      staffId: resolvedStaffId,
      subjectId: resolvedSubjectId,
    }).returning({ id: staffAssignments.id });

    await invalidateTimetableReadCaches(institutionId, sectionId, resolvedStaffId);

    return NextResponse.json({ id: inserted.id });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to create assignment" }, { status: 500 });
  }
});

export const DELETE = requireRole(["INSTITUTION", "INSTITUTION_ADMIN"], async (req: NextRequest, { session }) => {
  const institutionId = getTenantContext(session);
  const url = new URL(req.url);
  const id = Number(url.searchParams.get("id"));

  if (!Number.isInteger(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const [assignment] = await db.select().from(staffAssignments)
    .where(and(eq(staffAssignments.id, id), eq(staffAssignments.institutionId, institutionId)))
    .limit(1);

  if (assignment) {
    await db.delete(staffAssignments).where(eq(staffAssignments.id, id));
    await invalidateTimetableReadCaches(institutionId, assignment.sectionId, assignment.staffId);
  }

  return NextResponse.json({ success: true });
});
