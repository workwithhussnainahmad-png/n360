import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { admissionApplicantAccounts, institutions } from '@/db/schema';
import { createAdmissionSessionToken, getAdmissionSessionFromRequest, setAdmissionSessionCookie } from '@/lib/admission-auth';
import { hashPassword, verifyPassword } from '@/lib/argon2-pool';
import { parseInstitutionHostname } from '@/lib/institution-domain';
import { getPublicSiteBaseDomain } from '@/lib/public-site-domain';
import { withRateLimit } from '@/lib/rate-limit';
import { admissionApplicantChangePasswordSchema } from '@/lib/validators/admission-auth';

export async function POST(req: NextRequest) {
  const session = await getAdmissionSessionFromRequest(req);
  const parsedHostname = parseInstitutionHostname(req.headers.get('host') || '', await getPublicSiteBaseDomain());
  if (!session || parsedHostname.kind !== 'institution') {
    return NextResponse.json({ error: 'Applicant session required' }, { status: 401 });
  }
  const rateLimit = await withRateLimit(req, 'admission_auth', session.applicantId);
  if (!rateLimit.success) return NextResponse.json({ error: 'Too many attempts. Please wait and try again.' }, { status: 429 });

  const [hostInstitution] = await db.select({ id: institutions.id }).from(institutions).where(and(
    eq(institutions.id, session.institutionId),
    eq(institutions.publicSlug, parsedHostname.slug),
  )).limit(1);
  if (!hostInstitution) return NextResponse.json({ error: 'Applicant session required' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }
  const parsed = admissionApplicantChangePasswordSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid password' }, { status: 400 });

  const [account] = await db.select().from(admissionApplicantAccounts).where(and(
    eq(admissionApplicantAccounts.id, session.applicantId),
    eq(admissionApplicantAccounts.institutionId, session.institutionId),
  )).limit(1);
  if (!account) return NextResponse.json({ error: 'Applicant account not found' }, { status: 401 });
  if (account.sessionVersion !== session.sessionVersion) return NextResponse.json({ error: 'Applicant session expired' }, { status: 401 });

  const valid = await verifyPassword(account.passwordHash, parsed.data.currentPassword);
  if (!valid) return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 });

  const passwordHash = await hashPassword(parsed.data.newPassword);
  const sessionVersion = account.sessionVersion + 1;
  await db.update(admissionApplicantAccounts).set({
    passwordHash,
    mustChangePassword: false,
    sessionVersion,
    failedLoginCount: 0,
    lockedUntil: null,
    updatedAt: new Date(),
  }).where(and(
    eq(admissionApplicantAccounts.id, account.id),
    eq(admissionApplicantAccounts.institutionId, account.institutionId),
  ));

  const token = await createAdmissionSessionToken(account.id, account.institutionId, sessionVersion);
  const response = NextResponse.json({ success: true, redirectTo: '/admissions/portal' });
  setAdmissionSessionCookie(response, token, req.headers.get('host') || '');
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
