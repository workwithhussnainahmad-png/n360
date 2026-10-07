import { students } from "@/db/schema";

/** Columns needed for class/section-scoped student pages — never passwordHash. */
export const studentPlacementColumns = {
  id: students.id,
  name: students.name,
  institutionId: students.institutionId,
  classId: students.classId,
  sectionId: students.sectionId,
  academicStatus: students.academicStatus,
} as const;
