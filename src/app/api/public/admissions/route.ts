import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { admissionApplicantAccounts, admissionApplications, admissionCycles, admissionOfferings } from '@/db/schema';
import { hashPassword } from '@/lib/argon2-pool';
import { parseInstitutionHostname } from '@/lib/institution-domain';
import { getPublicSiteBaseDomain } from '@/lib/public-site-domain';
import { resolveInstitutionTenant } from '@/lib/institution-tenant';
import { withRateLimit } from '@/lib/rate-limit';
import { publicAdmissionApplicationSchema } from '@/lib/validators/admissions';
import { admissionCalendarDate, admissionCalendarDateSql } from '@/lib/admission-calendar';
import { AdmissionCampusError, requireOpenAdmissionCampus } from '@/lib/admission-campus';

const admissionToday = admissionCalendarDateSql();

export async function POST(req: NextRequest) {
  const parsedHostname = parseInstitutionHostname(req.headers.get('host') || '', await getPublicSiteBaseDomain());
  if (parsedHostname.kind !== 'institution') {
    return NextResponse.json({ error: 'Institution website not found' }, { status: 404 });
  }

  const tenantResolution = await resolveInstitutionTenant(parsedHostname.slug);
  if (tenantResolution.kind !== 'active' || !tenantResolution.tenant.admissionsEnabled) {
    return NextResponse.json({ error: 'Admissions are not currently open' }, { status: 409 });
  }
  const tenant = tenantResolution.tenant;

  const rateLimit = await withRateLimit(req, 'admissions', tenant.id);
  if (!rateLimit.success) {
    return NextResponse.json({ error: 'Too many application attempts. Please wait and try again.' }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }

  const parsed = publicAdmissionApplicationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid application information' }, { status: 400 });
  }
  if (parsed.data.dateOfBirth > admissionCalendarDate()) {
    return NextResponse.json({ error: 'Date of birth cannot be in the future' }, { status: 400 });
  }

  const [offering] = await db.select({
    offeringId: admissionOfferings.id,
    cycleId: admissionCycles.id,
  }).from(admissionOfferings).innerJoin(
    admissionCycles,
    eq(admissionCycles.id, admissionOfferings.cycleId),
  ).where(and(
    eq(admissionOfferings.id, parsed.data.offeringId),
    eq(admissionOfferings.institutionId, tenant.id),
    eq(admissionOfferings.isActive, true),
    eq(admissionCycles.institutionId, tenant.id),
    eq(admissionCycles.status, 'OPEN'),
    sql`(${admissionCycles.opensOn} IS NULL OR ${admissionCycles.opensOn} <= ${admissionToday})`,
    sql`(${admissionCycles.closesOn} IS NULL OR ${admissionCycles.closesOn} >= ${admissionToday})`,
  )).limit(1);

  if (!offering) {
    return NextResponse.json({ error: 'That admission offering is unavailable' }, { status: 409 });
  }
  try {
    await requireOpenAdmissionCampus(tenant.id, offering.cycleId, parsed.data.campusId);
  } catch (error) {
    if (error instanceof AdmissionCampusError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }

  const [duplicate] = await db.select({ id: admissionApplications.id }).from(admissionApplications).where(and(
    eq(admissionApplications.intakeInstitutionId, tenant.id),
    eq(admissionApplications.cycleId, offering.cycleId),
    sql`lower(${admissionApplications.guardianEmail}) = ${parsed.data.guardianEmail}`,
    sql`lower(${admissionApplications.studentName}) = ${parsed.data.studentName.toLowerCase()}`,
  )).limit(1);
  if (duplicate) {
    return NextResponse.json({ error: 'An application for this student already exists in the current admission cycle' }, { status: 409 });
  }

  let [existingAccount] = await db.select({ id: admissionApplicantAccounts.id }).from(admissionApplicantAccounts).where(and(
    eq(admissionApplicantAccounts.institutionId, tenant.id),
    sql`lower(${admissionApplicantAccounts.guardianEmail}) = ${parsed.data.guardianEmail}`,
  )).limit(1);

  let temporaryPassword: string | null = null;
  let temporaryPasswordHash: string | null = null;
  if (!existingAccount) {
    temporaryPassword = crypto.randomBytes(9).toString('base64url');
    temporaryPasswordHash = await hashPassword(temporaryPassword);
  }

  const applicationNumber = `ADM-${new Date().getUTCFullYear()}-${crypto.randomUUID().replace(/-/g, '').slice(0, 20).toUpperCase()}`;
  let result: {
    application: { applicationNumber: string; campusName: string; status: string; submittedAt: Date };
    accountCreated: boolean;
  };
  try {
    result = await db.transaction(async (tx) => {
      const [lockedCycle] = await tx.select({ id: admissionCycles.id }).from(admissionCycles).where(and(
        eq(admissionCycles.id, offering.cycleId), eq(admissionCycles.institutionId, tenant.id), eq(admissionCycles.status, 'OPEN'),
        sql`(${admissionCycles.opensOn} IS NULL OR ${admissionCycles.opensOn} <= ${admissionToday})`,
        sql`(${admissionCycles.closesOn} IS NULL OR ${admissionCycles.closesOn} >= ${admissionToday})`,
      )).for('share').limit(1);
      if (!lockedCycle) throw new AdmissionCampusError('Admissions are not currently open', 409);
      const campus = await requireOpenAdmissionCampus(tenant.id, offering.cycleId, parsed.data.campusId, tx);
      let accountCreated = false;
      if (!existingAccount && temporaryPasswordHash) {
        const [insertedAccount] = await tx.insert(admissionApplicantAccounts).values({
          institutionId: tenant.id,
          guardianEmail: parsed.data.guardianEmail,
          passwordHash: temporaryPasswordHash,
        }).onConflictDoNothing().returning({ id: admissionApplicantAccounts.id });
        existingAccount = insertedAccount;
        accountCreated = Boolean(insertedAccount);
      }

      if (!existingAccount) {
        [existingAccount] = await tx.select({ id: admissionApplicantAccounts.id }).from(admissionApplicantAccounts).where(and(
          eq(admissionApplicantAccounts.institutionId, tenant.id),
          sql`lower(${admissionApplicantAccounts.guardianEmail}) = ${parsed.data.guardianEmail}`,
        )).limit(1);
      }
      if (!existingAccount) throw new Error('Unable to create applicant account');

      const [application] = await tx.insert(admissionApplications).values({
        institutionId: campus.institutionId,
        intakeInstitutionId: tenant.id,
        campusId: campus.id,
        campusName: campus.name,
        cycleId: offering.cycleId,
        offeringId: offering.offeringId,
        applicantId: existingAccount.id,
        applicationNumber,
        studentName: parsed.data.studentName,
        dateOfBirth: parsed.data.dateOfBirth,
        gender: parsed.data.gender,
        guardianName: parsed.data.guardianName,
        guardianEmail: parsed.data.guardianEmail,
        guardianPhone: parsed.data.guardianPhone,
        previousInstitution: parsed.data.previousInstitution,
        previousClassMarks: parsed.data.previousClassMarks,
        medicalInformation: parsed.data.medicalInformation,
        notes: parsed.data.notes,
      }).returning({
        applicationNumber: admissionApplications.applicationNumber,
        campusName: admissionApplications.campusName,
        status: admissionApplications.status,
        submittedAt: admissionApplications.submittedAt,
      });
      return { application, accountCreated };
    });
  } catch (error) {
    if (error instanceof AdmissionCampusError) return NextResponse.json({ error: error.message }, { status: error.status });
    const databaseError = error as { code?: string; cause?: { code?: string } };
    if (databaseError.code === '23505' || databaseError.cause?.code === '23505') {
      return NextResponse.json({ error: 'An application for this student already exists in the current admission cycle' }, { status: 409 });
    }
    throw error;
  }

  const response = NextResponse.json({
    application: result.application,
    applicantAccount: {
      email: parsed.data.guardianEmail,
      temporaryPassword: result.accountCreated ? temporaryPassword : null,
      existingAccount: !result.accountCreated,
    },
  }, { status: 201 });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
