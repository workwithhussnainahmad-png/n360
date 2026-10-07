import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  campuses,
  classes,
  institutions,
  parentAccounts,
  parentStudents,
  sections,
  students,
} from "@/db/schema";
import type { JWTPayload } from "@/lib/auth-types";
import { jsonRows } from "@/lib/dashboard-data";

export class ParentChildAccessError extends Error {
  constructor() {
    super("The requested student is not linked to this parent account");
  }
}

export async function getParentPortalContext(
  session: JWTPayload,
  requestedStudentId?: string | number | null,
  options: { selectedOnly?: boolean } = {},
) {
  if (session.role !== "PARENT" || !session.institutionId) {
    throw new ParentChildAccessError();
  }

  let requestedId: number | null = null;
  if (requestedStudentId !== undefined && requestedStudentId !== null && String(requestedStudentId) !== "") {
    requestedId = Number(requestedStudentId);
    if (!Number.isInteger(requestedId) || requestedId <= 0) throw new ParentChildAccessError();
  }
  const childFilters = [
    eq(parentStudents.parentId, session.userId),
    eq(parentStudents.institutionId, session.institutionId),
    eq(students.institutionId, session.institutionId),
    isNull(students.deletedAt),
  ];
  if (requestedId !== null && options.selectedOnly) childFilters.push(eq(students.id, requestedId));
  const childQuery = db.select({
    id: students.id, name: students.name,
    loginRollNumber: sql<string>`${students.loginRollNumber}`.as('loginRollNumber'),
    profilePictureUrl: sql<string | null>`${students.profilePictureUrl}`.as('profilePictureUrl'),
    classId: sql<number>`${students.classId}`.as('classId'), className: sql<string>`${classes.name}`.as('className'),
    sectionId: sql<number>`${students.sectionId}`.as('sectionId'), sectionName: sql<string>`${sections.name}`.as('sectionName'),
    campusId: sql<number | null>`${students.campusId}`.as('campusId'), campusName: sql<string | null>`${campuses.name}`.as('campusName'),
    academicStatus: sql<typeof students.$inferSelect.academicStatus>`${students.academicStatus}`.as('academicStatus'),
    createdAt: sql<string>`to_char(${students.createdAt}, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`.as('createdAt'),
  }).from(parentStudents).innerJoin(students, eq(parentStudents.studentId, students.id))
    .innerJoin(classes, eq(students.classId, classes.id)).innerJoin(sections, eq(students.sectionId, sections.id))
    .leftJoin(campuses, eq(students.campusId, campuses.id)).where(and(...childFilters))
    .orderBy(asc(students.name), asc(students.id));

  const [row] = await db.select({
      id: parentAccounts.id,
      name: parentAccounts.name,
      email: parentAccounts.email,
      institutionName: institutions.name,
      institutionUsername: institutions.username,
      children: jsonRows<Awaited<typeof childQuery>[number]>(requestedId !== null && options.selectedOnly ? childQuery.limit(1) : childQuery),
    })
      .from(parentAccounts)
      .innerJoin(institutions, eq(parentAccounts.institutionId, institutions.id))
      .where(and(
        eq(parentAccounts.id, session.userId),
        eq(parentAccounts.institutionId, session.institutionId),
      ))
      .limit(1);
  if (!row) throw new ParentChildAccessError();
  const { children: childRows, ...parent } = row;
  const children = childRows.map(child => ({ ...child, createdAt: new Date(child.createdAt) }));

  const selectedChild = requestedId === null
    ? children[0] ?? null
    : children.find((child) => child.id === requestedId) ?? null;
  if (requestedId !== null && !selectedChild) throw new ParentChildAccessError();

  return {
    institutionId: session.institutionId,
    parent,
    children,
    selectedChild,
  };
}

export type ParentPortalContext = Awaited<ReturnType<typeof getParentPortalContext>>;
