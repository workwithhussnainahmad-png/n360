import { and, eq, getTableColumns, ne, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import { admissionApplicantAccounts, admissionApplications, admissionEnrollments } from '@/db/schema';
import type { AdmissionSession } from './admission-auth';

/** Fresh session version and application eligibility in one database round trip. */
export async function getActiveApplicantAccount(session: AdmissionSession, institutionId: number) {
  if (session.institutionId !== institutionId) return null;
  const remaining = db.select({ id: admissionApplications.id }).from(admissionApplications).where(and(
    eq(admissionApplications.intakeInstitutionId, institutionId), eq(admissionApplications.applicantId, session.applicantId),
    or(ne(admissionApplications.status, 'ENROLLED'), sql`exists (select 1 from ${admissionEnrollments}
      where ${admissionEnrollments.applicationId} = ${admissionApplications.id}
      and ${admissionEnrollments.institutionId} = ${admissionApplications.institutionId}
      and ${admissionEnrollments.createdAt} >= now() - interval '7 days')`),
  ));
  const [row] = await db.select({ ...getTableColumns(admissionApplicantAccounts),
    hasRemaining: sql<boolean>`exists (${remaining})`,
  }).from(admissionApplicantAccounts).where(and(
    eq(admissionApplicantAccounts.id, session.applicantId), eq(admissionApplicantAccounts.institutionId, institutionId),
  )).limit(1);
  if (!row || row.sessionVersion !== session.sessionVersion) return null;
  const { hasRemaining, ...account } = row;
  if (!hasRemaining) {
    await db.delete(admissionApplicantAccounts).where(and(
      eq(admissionApplicantAccounts.id, account.id), eq(admissionApplicantAccounts.institutionId, institutionId),
    ));
    return null;
  }
  return account;
}
