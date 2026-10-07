import { and, asc, eq, isNull, or, sql, type SQLWrapper } from 'drizzle-orm';
import { db } from '@/db';
import { admissionApplications, admissionCycleCampuses, admissionCycles, campuses, institutions } from '@/db/schema';
import { admissionCalendarDateSql } from './admission-calendar';

type Reader = Pick<typeof db, 'select'>;
export type AdmissionCampus = { id: number; name: string; institutionId: number };
export class AdmissionCampusError extends Error {
  constructor(message: string, public readonly status = 400) { super(message); }
}

/** Correlated predicate for fresh public-page visibility, independent of profile caches. */
export function openAdmissionCampusExistsSql(cycleId: SQLWrapper, intakeId: SQLWrapper) {
  return sql`EXISTS (SELECT 1 FROM admission_cycle_campuses available
    JOIN campuses available_campus ON available_campus.id = available.campus_id AND available_campus.institution_id = available.institution_id
    JOIN institutions available_workspace ON available_workspace.id = available.institution_id
    WHERE available.cycle_id = ${cycleId} AND available.is_open = true
      AND (available_workspace.id = ${intakeId} OR available_workspace.parent_institution_id = ${intakeId})
      AND available_workspace.status = 'APPROVED' AND available_workspace.deleted_at IS NULL
      AND available_campus.deleted_at IS NULL AND available_campus.name = available_workspace.campus_name)`;
}

export async function listOpenAdmissionCampuses(intakeInstitutionId: number, cycleId: number, reader: Reader = db): Promise<AdmissionCampus[]> {
  const today = admissionCalendarDateSql();
  return reader.select({ id: campuses.id, name: campuses.name, institutionId: institutions.id })
    .from(campuses).innerJoin(institutions, eq(institutions.id, campuses.institutionId))
    .innerJoin(admissionCycleCampuses, and(eq(admissionCycleCampuses.campusId, campuses.id), eq(admissionCycleCampuses.institutionId, institutions.id)))
    .innerJoin(admissionCycles, eq(admissionCycles.id, admissionCycleCampuses.cycleId))
    .where(and(eq(admissionCycles.id, cycleId), eq(admissionCycles.institutionId, intakeInstitutionId), eq(admissionCycles.status, 'OPEN'),
      sql`(${admissionCycles.opensOn} IS NULL OR ${admissionCycles.opensOn} <= ${today})`,
      sql`(${admissionCycles.closesOn} IS NULL OR ${admissionCycles.closesOn} >= ${today})`,
      eq(admissionCycleCampuses.isOpen, true),
      or(eq(institutions.id, intakeInstitutionId), eq(institutions.parentInstitutionId, intakeInstitutionId)),
      eq(campuses.name, institutions.campusName), eq(institutions.status, 'APPROVED'), isNull(institutions.deletedAt), isNull(campuses.deletedAt),
    )).orderBy(asc(campuses.id));
}

export async function requireOpenAdmissionCampus(intakeId: number, cycleId: number, campusId?: number | null, reader: Reader = db) {
  if (campusId != null) selectAdmissionCampus(await listAdmissionCampuses(intakeId, reader), campusId);
  const options = await listOpenAdmissionCampuses(intakeId, cycleId, reader);
  if (!options.length || (campusId != null && !options.some(campus => campus.id === campusId))) {
    throw new AdmissionCampusError('Admissions are closed for this campus. Refresh to see available campuses.', 409);
  }
  return selectAdmissionCampus(options, campusId);
}

/** Only approved campus workspaces belonging to this public institution. */
export async function listAdmissionCampuses(intakeInstitutionId: number, reader: Reader = db): Promise<AdmissionCampus[]> {
  return reader.select({ id: campuses.id, name: campuses.name, institutionId: institutions.id })
    .from(campuses).innerJoin(institutions, eq(institutions.id, campuses.institutionId))
    .where(and(
      or(eq(institutions.id, intakeInstitutionId), eq(institutions.parentInstitutionId, intakeInstitutionId)),
      eq(campuses.name, institutions.campusName),
      eq(institutions.status, 'APPROVED'), isNull(institutions.deletedAt), isNull(campuses.deletedAt),
    )).orderBy(asc(campuses.id));
}

export function selectAdmissionCampus(options: AdmissionCampus[], campusId?: number | null): AdmissionCampus {
  const selected = campusId == null && options.length === 1 ? options[0] : options.find(campus => campus.id === campusId);
  if (!selected) throw new AdmissionCampusError(options.length > 1 && campusId == null ? 'Select Campus' : 'Select a valid campus');
  return selected;
}

export async function admissionOfferingOwners(institutionId: number): Promise<number[]> {
  const [workspace] = await db.select({ parentId: institutions.parentInstitutionId }).from(institutions)
    .where(and(eq(institutions.id, institutionId), eq(institutions.status, 'APPROVED'), isNull(institutions.deletedAt))).limit(1);
  return workspace?.parentId ? [institutionId, workspace.parentId] : [institutionId];
}

/** Cycle/program configuration belongs exclusively to the main institution workspace. */
export async function canConfigureAdmissions(institutionId: number): Promise<boolean> {
  const [main] = await db.select({ id: institutions.id }).from(institutions).where(and(
    eq(institutions.id, institutionId), isNull(institutions.parentInstitutionId),
    eq(institutions.status, 'APPROVED'), isNull(institutions.deletedAt),
  )).limit(1);
  return Boolean(main);
}

// A campus must never reset credentials shared with another campus's applications.
export const applicantCredentialResetAllowedSql = sql<boolean>`${admissionApplications.intakeInstitutionId} = ${admissionApplications.institutionId}
  AND NOT EXISTS (SELECT 1 FROM institutions credential_child WHERE credential_child.parent_institution_id = ${admissionApplications.intakeInstitutionId})`;
