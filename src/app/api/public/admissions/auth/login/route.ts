import { NextRequest, NextResponse } from 'next/server';
import { and, eq, ne, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import { admissionApplicantAccounts, admissionApplications, admissionEnrollments } from '@/db/schema';
import { createAdmissionSessionToken, setAdmissionSessionCookie } from '@/lib/admission-auth';
import { verifyPassword } from '@/lib/argon2-pool';
import { parseInstitutionHostname } from '@/lib/institution-domain';
import { getPublicSiteBaseDomain } from '@/lib/public-site-domain';
import { resolveInstitutionTenant } from '@/lib/institution-tenant';
import { withRateLimit } from '@/lib/rate-limit';
import { admissionApplicantLoginSchema } from '@/lib/validators/admission-auth';

const INVALID_CREDENTIALS = { error: 'Invalid email or password' };

export async function POST(req: NextRequest) {
  const parsedHostname = parseInstitutionHostname(req.headers.get('host') || '', await getPublicSiteBaseDomain());
  if (parsedHostname.kind !== 'institution') return NextResponse.json(INVALID_CREDENTIALS, { status: 401 });

  const tenantResolution = await resolveInstitutionTenant(parsedHostname.slug);
  if (tenantResolution.kind !== 'active') return NextResponse.json(INVALID_CREDENTIALS, { status: 401 });
  const institutionId = tenantResolution.tenant.id;

  const rateLimit = await withRateLimit(req, 'admission_auth', institutionId);
  if (!rateLimit.success) return NextResponse.json({ error: 'Too many login attempts. Please wait and try again.' }, { status: 429 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }
  const parsed = admissionApplicantLoginSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json(INVALID_CREDENTIALS, { status: 401 });

  const [account] = await db.select().from(admissionApplicantAccounts).where(and(
    eq(admissionApplicantAccounts.institutionId, institutionId),
    sql`lower(${admissionApplicantAccounts.guardianEmail}) = ${parsed.data.email}`,
  )).limit(1);
  if (!account || (account.lockedUntil && account.lockedUntil > new Date())) {
    return NextResponse.json(INVALID_CREDENTIALS, { status: 401 });
  }

  const valid = await verifyPassword(account.passwordHash, parsed.data.password);
  if (!valid) {
    const failedLoginCount = account.failedLoginCount + 1;
    const lockedUntil = failedLoginCount >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
    await db.update(admissionApplicantAccounts).set({ failedLoginCount, lockedUntil, updatedAt: new Date() }).where(and(
      eq(admissionApplicantAccounts.id, account.id),
      eq(admissionApplicantAccounts.institutionId, institutionId),
    ));
    return NextResponse.json(INVALID_CREDENTIALS, { status: 401 });
  }

  const [remainingApplication] = await db.select({ id: admissionApplications.id }).from(admissionApplications).where(and(
    eq(admissionApplications.intakeInstitutionId, institutionId),
    eq(admissionApplications.applicantId, account.id),
    or(
      ne(admissionApplications.status, 'ENROLLED'),
      sql`exists (
        select 1 from ${admissionEnrollments}
        where ${admissionEnrollments.applicationId} = ${admissionApplications.id}
          and ${admissionEnrollments.institutionId} = ${admissionApplications.institutionId}
          and ${admissionEnrollments.createdAt} >= now() - interval '7 days'
      )`,
    ),
  )).limit(1);
  if (!remainingApplication) {
    await db
      .delete(admissionApplicantAccounts)
      .where(eq(admissionApplicantAccounts.id, account.id));
    return NextResponse.json(
      {
        error:
          "Applicant portal access has expired 7 days after enrollment. Please sign in to the Parent Portal.",
      },
      { status: 401 },
    );
  }

  await db.update(admissionApplicantAccounts).set({
    failedLoginCount: 0,
    lockedUntil: null,
    lastLoginAt: new Date(),
    updatedAt: new Date(),
  }).where(and(eq(admissionApplicantAccounts.id, account.id), eq(admissionApplicantAccounts.institutionId, institutionId)));

  const token = await createAdmissionSessionToken(account.id, institutionId, account.sessionVersion);
  const response = NextResponse.json({
    success: true,
    mustChangePassword: false,
    redirectTo: '/admissions/portal',
  });
  setAdmissionSessionCookie(response, token, req.headers.get('host') || '');
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
