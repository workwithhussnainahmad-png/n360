import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/db';
import { classes, sections, staff, subjects } from '@/db/schema';
import { jsonRows } from './dashboard-data';
import { getCachedOrFetch, invalidateReadCacheKeys, invalidateReadCachePatterns } from './redis';
import { academicCacheKey } from './cache-policy';

/** Shared by SSR, academics API and section pickers; teacher labels bound this to 30 seconds. */
export async function getInstitutionAcademicsData(institutionId: number) {
  return getCachedOrFetch(academicCacheKey(institutionId), 30, () => fetchInstitutionAcademicsData(institutionId));
}

export async function invalidateInstitutionAcademicsCache(institutionId: number) {
  try {
    await invalidateReadCacheKeys([academicCacheKey(institutionId)]);
    await invalidateReadCachePatterns([`cache:student-picker:${institutionId}:*`]);
  }
  catch (error) { console.warn('Academic cache invalidation failed:', error); }
}

async function fetchInstitutionAcademicsData(institutionId: number) {
  const subjectQuery = db.select({ id: subjects.id, name: subjects.name, code: subjects.code }).from(subjects)
    .where(and(eq(subjects.institutionId, institutionId), isNull(subjects.deletedAt))).orderBy(asc(subjects.name));
  const classQuery = db.select({ id: classes.id, name: classes.name, level: classes.level,
    isFinalClass: sql<boolean>`${classes.isFinalClass}`.as('isFinalClass') }).from(classes)
    .where(and(eq(classes.institutionId, institutionId), eq(classes.isGraduatedArchive, false), isNull(classes.deletedAt)))
    .orderBy(asc(classes.level), asc(classes.name));
  const sectionQuery = db.select({ id: sections.id, name: sections.name,
    classId: sql<number>`${sections.classId}`.as('classId'),
    classTeacherId: sql<number | null>`${sections.classTeacherId}`.as('classTeacherId'),
    classTeacherName: sql<string | null>`${staff.name}`.as('classTeacherName') })
    .from(sections).leftJoin(staff, and(eq(staff.id, sections.classTeacherId), eq(staff.institutionId, institutionId)))
    .where(and(eq(sections.institutionId, institutionId), isNull(sections.deletedAt))).orderBy(asc(sections.name));
  const [data] = await db.select({
    subjects: jsonRows<Awaited<typeof subjectQuery>[number]>(subjectQuery),
    classes: jsonRows<Awaited<typeof classQuery>[number]>(classQuery),
    sections: jsonRows<Awaited<typeof sectionQuery>[number]>(sectionQuery),
  }).from(sql`(select 1) as anchor`);
  return data;
}
