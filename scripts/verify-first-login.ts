import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { NextRequest, NextResponse } from 'next/server';
import { hash } from '@node-rs/argon2';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { requiresPasswordChange, type UserRole } from '../src/lib/auth-types';

async function main() {
  // Isolated process: no .env, database queries, Redis connections, or provider calls.
  process.env.JWT_SECRET = randomBytes(32).toString('hex');
  process.env.DATABASE_URL = 'postgres://test:test@127.0.0.1:1/test';
  process.env.NEXT_PHASE = 'phase-production-build';
  const key = new TextEncoder().encode(process.env.JWT_SECRET);
  const { createAccessToken, verifyAccessToken } = await import('../src/lib/auth');
  const { requireRole } = await import('../src/lib/rbac');
  const { proxy } = await import('../src/proxy');
  const { db, pool } = await import('../src/db');
  const memory = await PGlite.create();
  const original = { select: db.select, update: db.update, delete: db.delete };

  try {
    for (const role of ['STUDENT', 'STAFF', 'PARENT', 'EMPLOYEE', 'SUPER_ADMIN', 'INSTITUTION', 'INSTITUTION_ADMIN'] as UserRole[]) {
      const expected = !['STUDENT', 'STAFF', 'PARENT'].includes(role);
      assert.equal(requiresPasswordChange(role, true), expected);
      assert.equal(requiresPasswordChange(role, false), false);
      assert.equal(requiresPasswordChange(role), false);

      // Simulate a session issued before the policy change, with the old flag still true.
      const oldToken = await new SignJWT({ userId: 41, role, institutionId: 7, mustChangePassword: true })
        .setProtectedHeader({ alg: 'HS256' }).setNotBefore(Math.floor(Date.now() / 1000) - 5).setExpirationTime('5m').sign(key);
      const session = await verifyAccessToken(oldToken);
      assert.equal(session?.mustChangePassword, expected, `${role}: existing token`);
      assert.equal((await verifyAccessToken(oldToken))?.mustChangePassword, expected, `${role}: cached token`);
      const realNow = Date.now;
      try {
        Date.now = () => realNow() - 10_000;
        assert.equal(await verifyAccessToken(oldToken), null, `${role}: cached not-before claim survives a clock rollback`);
      } finally {
        Date.now = realNow;
      }

      // Login and refresh share this token issuer.
      const newToken = await createAccessToken({ userId: 41, role, institutionId: 7, mustChangePassword: true });
      assert.equal((await jwtVerify(newToken, key)).payload.mustChangePassword, expected, `${role}: new token`);

      const guarded = requireRole([role], () => NextResponse.json({ success: true }), { light: true });
      const response = await guarded(new NextRequest('http://localhost/api/me/check', {
        headers: { authorization: `Bearer ${oldToken}` },
      }), {});
      assert.equal(response.status, expected ? 403 : 200, `${role}: API password guard`);
      if (expected) assert.equal((await response.json()).error, 'PASSWORD_CHANGE_REQUIRED');

      if (['STUDENT', 'STAFF', 'PARENT', 'EMPLOYEE'].includes(role)) {
        const portal = role.toLowerCase();
        const headers = { host: `${portal}.localhost:3000`, cookie: `access_token=${oldToken}` };
        const dashboard = await proxy(new NextRequest(`http://${portal}.localhost:3000/dashboard`, { headers }));
        assert.equal(dashboard.headers.get('location')?.includes('/force-password-change') ?? false, expected, `${role}: dashboard redirect`);
        const forcedPage = await proxy(new NextRequest(`http://${portal}.localhost:3000/force-password-change`, { headers }));
        assert.equal(forcedPage.headers.get('location')?.endsWith(`/${portal}/dashboard`) ?? false, !expected, `${role}: forced-page bypass`);
      }
    }

    const unauthenticated = requireRole(['STUDENT'], () => NextResponse.json({ success: true }), { light: true });
    assert.equal((await unauthenticated(new NextRequest('http://localhost/api/me/check'), {})).status, 401);
    const staffToken = await createAccessToken({ userId: 41, role: 'STAFF' });
    assert.equal((await unauthenticated(new NextRequest('http://localhost/api/me/check', {
      headers: { authorization: `Bearer ${staffToken}` },
    }), {})).status, 403, 'role checks must still apply');
    assert.equal(await verifyAccessToken('invalid-token'), null);

    // Exercise applicant handlers against an isolated PostgreSQL-compatible fixture.
    const schema = await import('../src/db/schema');
    for (const table of [schema.institutions, schema.systemSettings, schema.institutionPublicProfiles,
      schema.admissionCycles, schema.admissionApplicantAccounts, schema.admissionApplications,
      schema.admissionEnrollments, schema.admissionFeePayments, schema.admissionDocumentRequests]) {
      const config = getTableConfig(table);
      const columns = config.columns.map((column) => {
        const type = column.columnType === 'PgEnumColumn' ? 'text' : column.getSQLType();
        return `"${column.name}" ${type}${column.primary ? ' PRIMARY KEY' : ''}`;
      });
      await memory.exec(`CREATE TABLE "${config.name}" (${columns.join(',')})`);
    }
    const fixture = drizzle(memory, { schema });
    Object.assign(db, {
      select: fixture.select.bind(fixture), update: fixture.update.bind(fixture), delete: fixture.delete.bind(fixture),
    });
    await fixture.insert(schema.institutions).values({
      id: 7, name: 'First Login School', publicSlug: 'first-login-school', status: 'APPROVED', publicSiteEnabled: true,
    } as typeof schema.institutions.$inferInsert);
    await fixture.insert(schema.admissionApplicantAccounts).values({
      id: 41, institutionId: 7, guardianEmail: 'guardian@example.test', passwordHash: await hash('FirstLogin!123'),
      mustChangePassword: true, sessionVersion: 1, failedLoginCount: 0,
    });
    await fixture.insert(schema.admissionApplications).values({
      id: 51, institutionId: 7, applicantId: 41, status: 'FEE_PENDING',
    } as typeof schema.admissionApplications.$inferInsert);
    await fixture.insert(schema.admissionFeePayments).values({ id: 61, institutionId: 7, applicationId: 51, amount: 1500, status: 'PENDING', instructions: 'Test fee' });
    await fixture.insert(schema.admissionDocumentRequests).values({
      id: 71, institutionId: 7, applicationId: 51, status: 'REQUESTED',
    } as typeof schema.admissionDocumentRequests.$inferInsert);

    const { POST: applicantLogin } = await import('../src/app/api/public/admissions/auth/login/route');
    const host = 'first-login-school.nisaab360.app';
    const loggedIn = await applicantLogin(new NextRequest(`https://${host}/api/public/admissions/auth/login`, {
      method: 'POST', headers: { host, 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'guardian@example.test', password: 'FirstLogin!123' }),
    }));
    assert.equal(loggedIn.status, 200, 'flagged applicant can log in');
    const result = await loggedIn.json();
    assert.equal(result.mustChangePassword, false);
    assert.equal(result.redirectTo, '/admissions/portal');
    const cookie = `admission_session=${loggedIn.cookies.get('admission_session')?.value}`;
    const applicantRequest = (path: string, requestHost = host) => new NextRequest(`https://${requestHost}${path}`, {
      method: 'POST', headers: { host: requestHost, cookie, 'content-type': 'application/json' }, body: '{}',
    });
    const { POST: document } = await import('../src/app/api/public/admissions/documents/[id]/route');
    const { POST: proof } = await import('../src/app/api/public/admissions/fees/[applicationId]/route');
    const { POST: pay } = await import('../src/app/api/public/admissions/fees/[applicationId]/pay/route');
    // A payload error proves authorization passed without uploading files or initiating payments.
    const documentResponse = await document(applicantRequest('/api/public/admissions/documents/71'), { params: Promise.resolve({ id: '71' }) });
    assert.equal((await documentResponse.json()).error, 'Invalid upload action');
    const proofResponse = await proof(applicantRequest('/api/public/admissions/fees/51'), { params: Promise.resolve({ applicationId: '51' }) });
    assert.equal((await proofResponse.json()).error, 'Invalid payment action');
    const payResponse = await pay(applicantRequest('/api/public/admissions/fees/51/pay'), { params: Promise.resolve({ applicationId: '51' }) });
    assert.equal((await payResponse.json()).error, 'Invalid payload');
    const { paymentAccess } = await import('../src/lib/payments/access');
    assert.ok(await paymentAccess(applicantRequest('/api/payments/test')), 'flagged applicant can access receipt scope');
    assert.equal((await document(applicantRequest('/api/public/admissions/documents/71', 'other-school.nisaab360.app'), { params: Promise.resolve({ id: '71' }) })).status, 401);
    await fixture.update(schema.admissionApplicantAccounts).set({ sessionVersion: 2 });
    assert.equal((await document(applicantRequest('/api/public/admissions/documents/71'), { params: Promise.resolve({ id: '71' }) })).status, 401, 'revoked applicant session remains blocked');
    assert.equal(await paymentAccess(applicantRequest('/api/payments/test')), null);
    process.stdout.write('First-login policy verification passed.\n');
  } finally {
    Object.assign(db, original);
    const { shutdownArgon2Pool } = await import('../src/lib/argon2-pool');
    await shutdownArgon2Pool();
    await memory.close();
    await pool.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
