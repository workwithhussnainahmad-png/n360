import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { institutions } from '@/db/schema';

/** Resolve the public parent namespace once per create/import/enrollment operation. */
export async function resolveStudentLoginInstitution<T extends {
  type: string; username: string; parentInstitutionId: number | null; campusName: string | null;
}>(institution: T) {
  if (institution.parentInstitutionId === null) return { ...institution, parentUsername: null };
  const [parent] = await db.select({ username: institutions.username }).from(institutions)
    .where(and(eq(institutions.id, institution.parentInstitutionId), isNull(institutions.parentInstitutionId), isNull(institutions.deletedAt))).limit(1);
  if (!parent) throw new Error('Parent institution not found for campus student login.');
  return { ...institution, parentUsername: parent.username };
}
