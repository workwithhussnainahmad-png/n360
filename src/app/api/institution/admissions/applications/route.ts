import { validationError } from '@/lib/validation-errors';
import { AdmissionCampusError, admissionOfferingOwners, listAdmissionCampuses, selectAdmissionCampus, requireOpenAdmissionCampus, type AdmissionCampus } from "@/lib/admission-campus";
import { admissionCalendarDateSql } from '@/lib/admission-calendar';
import crypto from 'crypto';
import { after, NextRequest, NextResponse } from 'next/server';
import { and, asc, desc, eq, ne, or, sql, inArray, isNull, isNotNull, type SQL } from 'drizzle-orm';
import { db } from '@/db';
import { admissionApplicantAccounts, admissionApplicationEvents, admissionApplications, admissionCycles, admissionOfferings, institutions } from '@/db/schema';
import { hashPassword } from '@/lib/argon2-pool';
import { getClientIp } from '@/lib/client-ip';
import { AdmissionCredentialEmail } from '@/lib/email';
import { enqueueEmail } from '@/lib/email-outbox';
import { logAudit } from '@/lib/audit';
import { getTenantContext, requireRole } from '@/lib/rbac';
import { publicAdmissionApplicationSchema } from '@/lib/validators/admissions';

const applicationStatuses = [
  'SUBMITTED', 'UNDER_REVIEW', 'DOCUMENTS_REQUIRED', 'TEST_SCHEDULED', 'INTERVIEW_SCHEDULED',
  'DECISION_PENDING', 'OFFERED', 'REJECTED', 'FEE_PENDING', 'FEE_VERIFICATION', 'FEE_VERIFIED', 'REFUND_REQUIRED',
  'ENROLLED', 'WITHDRAWN',
] as const;

export const GET = requireRole(['INSTITUTION', 'INSTITUTION_ADMIN'], async (req: NextRequest, { session }) => {
  const institutionId = getTenantContext(session);
  const page = Math.max(1, Number.parseInt(req.nextUrl.searchParams.get('page') || '1', 10) || 1);
  const pageSize = Math.min(50, Math.max(10, Number.parseInt(req.nextUrl.searchParams.get('pageSize') || '30', 10) || 30));
  const search = (req.nextUrl.searchParams.get('q') || '').trim().slice(0, 100);
  const cycleId = Number.parseInt(req.nextUrl.searchParams.get('cycle') || '', 10);
  const requestedStatus = req.nextUrl.searchParams.get('status') || '';
  const status = applicationStatuses.find((item) => item === requestedStatus);
  const offeringOwners = await admissionOfferingOwners(institutionId);
  const includeMeta = req.nextUrl.searchParams.get('meta') === '1';
  const history = req.nextUrl.searchParams.get('history') === '1';
  if (history) {
    const [cycle] = await db.select({ id: admissionCycles.id }).from(admissionCycles).where(and(eq(admissionCycles.id, cycleId || 0), inArray(admissionCycles.institutionId, offeringOwners), isNotNull(admissionCycles.archivedAt))).limit(1);
    if (!cycle) return NextResponse.json({ error: 'Archived admission cycle not found' }, { status: 404 });
  }
  // Enrolled applicants belong in Students, not in the operational admission queue.
  const activeCycle = sql`EXISTS (SELECT 1 FROM ${admissionCycles} WHERE ${admissionCycles.id} = ${admissionApplications.cycleId} AND ${admissionCycles.archivedAt} IS NULL)`;
  const conditions: SQL[] = [eq(admissionApplications.institutionId, institutionId)];
  if (!history) conditions.push(ne(admissionApplications.status, 'ENROLLED'), activeCycle);
  if (status) conditions.push(eq(admissionApplications.status, status));
  if (Number.isInteger(cycleId) && cycleId > 0) conditions.push(eq(admissionApplications.cycleId, cycleId));
  if (search) {
    const pattern = `${search.toLowerCase().replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
    conditions.push(or(
      sql`lower(${admissionApplications.applicationNumber}) like ${pattern}`,
      sql`lower(${admissionApplications.studentName}) like ${pattern}`,
      sql`lower(${admissionApplications.guardianName}) like ${pattern}`,
      sql`lower(${admissionApplications.guardianEmail}) like ${pattern}`,
      sql`lower(${admissionApplications.guardianPhone}) like ${pattern}`,
    )!);
  }
  const where = and(...conditions);

  const [applications, [totalRow], statusRows, metadata] = await Promise.all([
    db.select({
      id: admissionApplications.id, cycleId: admissionApplications.cycleId, offeringId: admissionApplications.offeringId,
      applicationNumber: admissionApplications.applicationNumber, studentName: admissionApplications.studentName,
      guardianName: admissionApplications.guardianName, guardianEmail: admissionApplications.guardianEmail,
      guardianPhone: admissionApplications.guardianPhone, status: admissionApplications.status,
      submittedAt: admissionApplications.submittedAt, offeringTitle: admissionOfferings.title,
      campusId: admissionApplications.campusId, campusName: admissionApplications.campusName,
      cycleName: admissionCycles.name, requiresTest: admissionCycles.requiresTest,
      requiresInterview: admissionCycles.requiresInterview,
    }).from(admissionApplications)
      .innerJoin(admissionOfferings, eq(admissionOfferings.id, admissionApplications.offeringId))
      .innerJoin(admissionCycles, eq(admissionCycles.id, admissionApplications.cycleId))
      .where(where)
      .orderBy(desc(admissionApplications.submittedAt), desc(admissionApplications.id))
      .limit(pageSize).offset((page - 1) * pageSize),
    db.select({ count: sql<number>`count(*)::int` }).from(admissionApplications).where(where),
    includeMeta
      ? db.select({ status: admissionApplications.status, count: sql<number>`count(*)::int` }).from(admissionApplications)
        .where(and(eq(admissionApplications.institutionId, institutionId), ne(admissionApplications.status, 'ENROLLED'), activeCycle)).groupBy(admissionApplications.status)
      : Promise.resolve([]),
    includeMeta ? Promise.all([
      db.select({
        offeringId: admissionOfferings.id, title: admissionOfferings.title, cycleId: admissionOfferings.cycleId,
        capacity: admissionOfferings.capacity,
        activeApplications: sql<number>`count(${admissionApplications.id}) filter (where ${admissionApplications.status} not in ('REJECTED', 'WITHDRAWN'))::int`,
        enrolled: sql<number>`count(${admissionApplications.id}) filter (where ${admissionApplications.status} = 'ENROLLED')::int`,
      }).from(admissionOfferings)
        .leftJoin(admissionApplications, and(eq(admissionApplications.offeringId, admissionOfferings.id), eq(admissionApplications.institutionId, institutionId)))
        .where(and(inArray(admissionOfferings.institutionId, offeringOwners), sql`EXISTS (SELECT 1 FROM ${admissionCycles} WHERE ${admissionCycles.id} = ${admissionOfferings.cycleId} AND ${admissionCycles.archivedAt} IS NULL)`)).groupBy(admissionOfferings.id).orderBy(asc(admissionOfferings.title)),
      db.select({ id: admissionCycles.id, name: admissionCycles.name, academicYear: admissionCycles.academicYear, status: admissionCycles.status }).from(admissionCycles)
        .where(and(inArray(admissionCycles.institutionId, offeringOwners), isNull(admissionCycles.archivedAt))).orderBy(desc(admissionCycles.createdAt)),
    ]) : Promise.resolve(null),
  ]);
  const total = totalRow?.count || 0;
  return NextResponse.json({
    applications,
    pagination: { page, pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)) },
    ...(metadata ? { stats: Object.fromEntries(statusRows.map((row) => [row.status, row.count])), capacity: metadata[0], cycles: metadata[1] } : {}),
  });
});

export const POST = requireRole(['INSTITUTION', 'INSTITUTION_ADMIN'], async (req: NextRequest, { session }) => {
  const institutionId = getTenantContext(session);
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 }); }
  const parsed = publicAdmissionApplicationSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json(validationError(parsed.error), { status: 400 });
  if (parsed.data.dateOfBirth > new Date().toISOString().slice(0, 10)) return NextResponse.json({ error: 'Date of birth cannot be in the future' }, { status: 400 });

  const owners = await admissionOfferingOwners(institutionId);
  const campusOptions = (await listAdmissionCampuses(institutionId)).filter(campus => campus.institutionId === institutionId);
  let campus: AdmissionCampus;
  try { campus = selectAdmissionCampus(campusOptions, parsed.data.campusId); } catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 400 }); }
  const [[offering], [institution]] = await Promise.all([
    db.select({ offeringId: admissionOfferings.id, cycleId: admissionOfferings.cycleId, intakeInstitutionId: admissionOfferings.institutionId, active: admissionOfferings.isActive }).from(admissionOfferings).where(and(eq(admissionOfferings.id, parsed.data.offeringId), inArray(admissionOfferings.institutionId, owners))).limit(1),
    db.select({ name: institutions.name }).from(institutions).where(eq(institutions.id, institutionId)).limit(1),
  ]);
  if (!offering?.active) return NextResponse.json({ error: 'Select an active admission offering' }, { status: 400 });
  const [duplicate] = await db.select({ id: admissionApplications.id }).from(admissionApplications).where(and(
    eq(admissionApplications.intakeInstitutionId, offering.intakeInstitutionId), eq(admissionApplications.cycleId, offering.cycleId),
    sql`lower(${admissionApplications.guardianEmail}) = ${parsed.data.guardianEmail}`,
    sql`lower(${admissionApplications.studentName}) = ${parsed.data.studentName.toLowerCase()}`,
  )).limit(1);
  if (duplicate) return NextResponse.json({ error: 'An application for this student already exists in that cycle' }, { status: 409 });

  let [account] = await db.select({ id: admissionApplicantAccounts.id }).from(admissionApplicantAccounts).where(and(eq(admissionApplicantAccounts.institutionId, offering.intakeInstitutionId), sql`lower(${admissionApplicantAccounts.guardianEmail}) = ${parsed.data.guardianEmail}`)).limit(1);
  const temporaryPassword = account ? null : crypto.randomBytes(9).toString('base64url');
  const passwordHash = temporaryPassword ? await hashPassword(temporaryPassword) : null;
  const applicationNumber = `ADM-${new Date().getUTCFullYear()}-${crypto.randomUUID().replace(/-/g, '').slice(0, 20).toUpperCase()}`;

  try {
    const result = await db.transaction(async (tx) => {
      const today = admissionCalendarDateSql();
      const [lockedCycle] = await tx.select({ id: admissionCycles.id }).from(admissionCycles).where(and(
        eq(admissionCycles.id, offering.cycleId), eq(admissionCycles.institutionId, offering.intakeInstitutionId), eq(admissionCycles.status, 'OPEN'),
        sql`(${admissionCycles.opensOn} IS NULL OR ${admissionCycles.opensOn} <= ${today})`,
        sql`(${admissionCycles.closesOn} IS NULL OR ${admissionCycles.closesOn} >= ${today})`,
      )).for('share').limit(1);
      if (!lockedCycle) throw new AdmissionCampusError('Admissions are not currently open', 409);
      campus = await requireOpenAdmissionCampus(offering.intakeInstitutionId, offering.cycleId, campus.id, tx);
      let accountCreated = false;
      if (!account && passwordHash) {
        const [created] = await tx.insert(admissionApplicantAccounts).values({ institutionId: offering.intakeInstitutionId, guardianEmail: parsed.data.guardianEmail, passwordHash }).onConflictDoNothing().returning({ id: admissionApplicantAccounts.id });
        account = created;
        accountCreated = Boolean(created);
      }
      if (!account) [account] = await tx.select({ id: admissionApplicantAccounts.id }).from(admissionApplicantAccounts).where(and(eq(admissionApplicantAccounts.institutionId, offering.intakeInstitutionId), sql`lower(${admissionApplicantAccounts.guardianEmail}) = ${parsed.data.guardianEmail}`)).limit(1);
      if (!account) throw new Error('Unable to create applicant account');
      const [application] = await tx.insert(admissionApplications).values({ institutionId, intakeInstitutionId: offering.intakeInstitutionId, campusId: campus.id, campusName: campus.name, cycleId: offering.cycleId, offeringId: offering.offeringId, applicantId: account.id, applicationNumber, studentName: parsed.data.studentName, dateOfBirth: parsed.data.dateOfBirth, gender: parsed.data.gender, guardianName: parsed.data.guardianName, guardianEmail: parsed.data.guardianEmail, guardianPhone: parsed.data.guardianPhone, previousInstitution: parsed.data.previousInstitution, previousClassMarks: parsed.data.previousClassMarks, medicalInformation: parsed.data.medicalInformation, notes: parsed.data.notes }).returning({ id: admissionApplications.id, applicationNumber: admissionApplications.applicationNumber });
      await tx.insert(admissionApplicationEvents).values({ institutionId, applicationId: application.id, title: 'Application recorded by institution', description: 'Institution staff entered this application for the parent or guardian.', fromStatus: null, toStatus: 'SUBMITTED', visibleToApplicant: true, actorId: session.userId, actorRole: session.role });
      return { application, accountCreated };
    });
    const ip = getClientIp(req);
    if (result.accountCreated && temporaryPassword && institution) {
      await enqueueEmail({
        institutionId,
        to: parsed.data.guardianEmail,
        subject: `Applicant portal credentials - ${institution.name}`,
        html: AdmissionCredentialEmail({ institutionName: institution.name, accountType: 'applicant', loginId: parsed.data.guardianEmail, temporaryPassword }),
        dedupeKey: `admission:${result.application.id}:initial-applicant-credentials`,
      });
    }
    after(async () => {
      try { await logAudit({ institutionId, actorId: session.userId, actorRole: session.role, action: 'CREATE_MANUAL_ADMISSION_APPLICATION', target: `Application ${result.application.applicationNumber}`, ip }); } catch (error) { console.error('Manual application audit failed:', error); }
    });
    return NextResponse.json({ application: result.application, applicantCredentials: result.accountCreated ? { loginId: parsed.data.guardianEmail, temporaryPassword } : null }, { status: 201 });
  } catch (error) {
    if (error instanceof AdmissionCampusError) return NextResponse.json({ error: error.message }, { status: error.status });
    const databaseError = error as { code?: string; cause?: { code?: string } };
    if ((databaseError.code || databaseError.cause?.code) === '23505') return NextResponse.json({ error: 'A matching application already exists' }, { status: 409 });
    throw error;
  }
});
