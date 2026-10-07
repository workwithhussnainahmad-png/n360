import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { institutions } from '@/db/schema';

export async function isMainCampusWebsite(institutionId: number) {
  const [institution] = await db.select({ parentId: institutions.parentInstitutionId })
    .from(institutions).where(eq(institutions.id, institutionId)).limit(1);
  return !!institution && institution.parentId === null;
}
