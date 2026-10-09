import { inputErrorResponse } from '@/lib/input-error-response';
import { validationError } from '@/lib/validation-errors';
import { after, NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { accountLockouts, superAdmins, employees, institutions, staff, students, institutionAdmins, parentAccounts } from '@/db/schema';
import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { verifyPassword as verify } from '@/lib/argon2-pool';
import { createTokens, setAuthCookies, UserRole } from '@/lib/auth';
import { JWTPayload, requiresPasswordChange } from '@/lib/auth-types';
import { PlatformLoginKind, withPlatformLoginRateLimit, withRateLimit } from '@/lib/rate-limit';
import { logAudit } from '@/lib/audit';
import { loginSchema } from '@/lib/validators/auth';
import { getUserCreatedAt } from '@/lib/user';
import { getClientIp } from '@/lib/client-ip';
import { AUTH_MAX_BODY_BYTES, readJsonBody } from '@/lib/http';
import { redis } from '@/lib/redis';
import { resolveCampusSession } from '@/lib/campus-workspaces';

/** Single pre-authentication failure response: never distinguishes "no such user" from "wrong password". */
const INVALID_CREDENTIALS = { error: 'Invalid credentials' };

const MAX_FAILED_LOGINS = Number(process.env.AUTH_LOCKOUT_MAX_FAILED || 5);
const LOCKOUT_WINDOW_MINUTES = Number(process.env.AUTH_LOCKOUT_WINDOW_MINUTES || 15);
const LOCKOUT_COOLDOWN_MINUTES = Number(process.env.AUTH_LOCKOUT_COOLDOWN_MINUTES || 15);
const LOGIN_LOOKUP_ORDER: UserRole[] = ['STUDENT', 'STAFF', 'INSTITUTION', 'INSTITUTION_ADMIN', 'EMPLOYEE', 'SUPER_ADMIN'];

type LoginCandidate = {
  role: UserRole;
  id: number;
  password_hash: string;
  security_answer_hash: string | null;
  is_super_admin: boolean | null;
  is_active: boolean | null;
  institution_id: number | null;
  campus_id: number | null;
  must_change_password: boolean | null;
  account_status: string | null;
  graduated_access_allowed: boolean | null;
  email: string | null;
  contact_email: string | null;
};

type SuperAdminLogin = { id: number; email?: string; passwordHash: string; securityAnswerHash: string; isSuperAdmin: boolean };
type EmployeeLogin = { id: number; email: string; passwordHash: string; mustChangePassword: boolean };
type InstitutionLogin = { id: number; contactEmail: string; adminPasswordHash: string; status: string; mustChangePassword: boolean };
type InstitutionAdminLogin = { id: number; email?: string; passwordHash: string; institutionId: number };
type StaffLogin = { id: number; email?: string; passwordHash: string; isActive: boolean; institutionId: number; campusId: number | null; mustChangePassword: boolean };
type StudentLogin = { id: number; loginRollNumber?: string; passwordHash: string; isActive: boolean; institutionId: number; mustChangePassword: boolean; academicStatus: 'ACTIVE' | 'GRADUATED'; graduatedAccessAllowed: boolean };
type ParentLogin = { id: number; email: string; passwordHash: string | null; institutionId: number; mustChangePassword: boolean; status: 'PENDING_ACTIVATION' | 'ACTIVE' | 'DISABLED'; institutionStatus: string };

async function findUnhintedLoginCandidate(loginIdentifier: string): Promise<LoginCandidate | null> {
  const result = await db.execute(sql`
    WITH login_input AS (
      SELECT ${loginIdentifier}::text AS identifier
    ),
    candidates AS (
      SELECT 'STUDENT'::text AS role, 1 AS priority, s.id, s.password_hash,
        NULL::text AS security_answer_hash, NULL::boolean AS is_super_admin,
        s.is_active, s.institution_id, NULL::integer AS campus_id,
        s.must_change_password, s.academic_status::text AS account_status,
        i3.allow_graduated_student_access AS graduated_access_allowed,
        NULL::text AS email, NULL::text AS contact_email
      FROM students AS s
      INNER JOIN institutions AS i3 ON i3.id = s.institution_id
      CROSS JOIN login_input AS i
      WHERE lower(s.login_roll_number) = i.identifier

      UNION ALL

      SELECT 'STAFF'::text, 2, s.id, s.password_hash,
        NULL::text, NULL::boolean, s.is_active, s.institution_id, s.campus_id,
        s.must_change_password, NULL::text, NULL::boolean, NULL::text, NULL::text
      FROM staff AS s CROSS JOIN login_input AS i
      WHERE lower(s.email) = i.identifier

      UNION ALL

      SELECT 'INSTITUTION'::text, 3, i2.id, i2.admin_password_hash,
        NULL::text, NULL::boolean, NULL::boolean, i2.id, NULL::integer,
        i2.must_change_password, i2.status::text, NULL::boolean, NULL::text, i2.contact_email::text
      FROM institutions AS i2 CROSS JOIN login_input AS i
      WHERE lower(i2.contact_email) = i.identifier

      UNION ALL

      SELECT 'INSTITUTION_ADMIN'::text, 4, ia.id, ia.password_hash,
        NULL::text, NULL::boolean, NULL::boolean, ia.institution_id, NULL::integer,
        NULL::boolean, NULL::text, NULL::boolean, NULL::text, NULL::text
      FROM institution_admins AS ia CROSS JOIN login_input AS i
      WHERE lower(ia.email) = i.identifier

      UNION ALL

      SELECT 'EMPLOYEE'::text, 5, e.id, e.password_hash,
        NULL::text, NULL::boolean, NULL::boolean, NULL::integer, NULL::integer,
        e.must_change_password, NULL::text, NULL::boolean, e.email::text, NULL::text
      FROM employees AS e CROSS JOIN login_input AS i
      WHERE lower(e.email) = i.identifier

      UNION ALL

      SELECT 'SUPER_ADMIN'::text, 6, sa.id, sa.password_hash,
        sa.security_answer_hash, sa.is_super_admin, NULL::boolean, NULL::integer,
        NULL::integer, NULL::boolean, NULL::text, NULL::boolean, NULL::text, NULL::text
      FROM super_admins AS sa CROSS JOIN login_input AS i
      WHERE lower(sa.email) = i.identifier
    )
    SELECT role, id, password_hash, security_answer_hash, is_super_admin, is_active,
      institution_id, campus_id, must_change_password, account_status, graduated_access_allowed, email, contact_email
    FROM candidates
    ORDER BY priority
    LIMIT 1
  `);

  return (result.rows[0] as LoginCandidate | undefined) ?? null;
}

function addMinutes(value: Date, minutes: number) {
  return new Date(value.getTime() + minutes * 60 * 1000);
}

async function assertNotLocked(role: UserRole, userId: number) {
  const [lockout] = await db.select()
    .from(accountLockouts)
    .where(and(eq(accountLockouts.userRole, role), eq(accountLockouts.userId, userId)))
    .limit(1);

  if (lockout?.lockedUntil && lockout.lockedUntil > new Date()) {
    throw new Error(`Account temporarily locked until ${lockout.lockedUntil.toISOString()}`);
  }
}

async function clearFailedLogins(role: UserRole, userId: number) {
  const [lockout] = await db.select()
    .from(accountLockouts)
    .where(and(eq(accountLockouts.userRole, role), eq(accountLockouts.userId, userId)))
    .limit(1);
  if (!lockout) return;
  await db.update(accountLockouts)
    .set({ failedCount: 0, lockedUntil: null, windowStartedAt: new Date(), updatedAt: new Date() })
    .where(eq(accountLockouts.id, lockout.id));
}

async function clearFailedLoginsBestEffort(role: UserRole, userId: number) {
  try {
    await clearFailedLogins(role, userId);
  } catch (err) {
    console.error('Failed to clear login lockout state:', err);
  }
}

async function recordFailedLogin(role: UserRole, userId: number, institutionId: number | undefined, ip: string) {
  const now = new Date();
  const [existing] = await db.select()
    .from(accountLockouts)
    .where(and(eq(accountLockouts.userRole, role), eq(accountLockouts.userId, userId)))
    .limit(1);

  const insideWindow = existing && addMinutes(existing.windowStartedAt, LOCKOUT_WINDOW_MINUTES) > now;
  const failedCount = insideWindow ? existing.failedCount + 1 : 1;
  const lockedUntil = failedCount >= MAX_FAILED_LOGINS ? addMinutes(now, LOCKOUT_COOLDOWN_MINUTES) : null;

  if (existing) {
    await db.update(accountLockouts)
      .set({
        failedCount,
        lockedUntil,
        windowStartedAt: insideWindow ? existing.windowStartedAt : now,
        updatedAt: now,
      })
      .where(eq(accountLockouts.id, existing.id));
  } else {
    await db.insert(accountLockouts).values({ userRole: role, userId, failedCount, lockedUntil, windowStartedAt: now, updatedAt: now });
  }

  if (lockedUntil) {
    await logAudit({
      institutionId,
      actorId: userId,
      actorRole: role,
      action: 'ACCOUNT_LOCKED',
      target: `User:${role}:${userId}`,
      ip,
    });
  }
}

async function rejectFailedLogin(role: UserRole, userId: number, institutionId: number | undefined, ip: string) {
  await recordFailedLogin(role, userId, institutionId, ip);
  return NextResponse.json(INVALID_CREDENTIALS, { status: 401 });
}

function getLoginLookupRoles(roleHint?: UserRole) {
  if (roleHint === 'INSTITUTION') return ['INSTITUTION', 'INSTITUTION_ADMIN'] as UserRole[];
  if (roleHint === 'STAFF') return ['STAFF', 'INSTITUTION_ADMIN'] as UserRole[];
  // Copy, never the module constant itself: the cached-role fast path below
  // splice/unshifts this array to try the remembered role first. Returning
  // LOGIN_LOOKUP_ORDER by reference let one request permanently reorder the
  // lookup priority for every later request in that process — shared mutable
  // state whose effect (which role wins when one identifier exists in two
  // tables) depended on whoever logged in most recently.
  return roleHint ? [roleHint] : [...LOGIN_LOOKUP_ORDER];
}

async function runPostLoginSideEffects(params: {
  role: UserRole;
  user: { id: number };
  institutionId?: number;
  ip: string;
}) {
  const { role, user, institutionId, ip } = params;

  try {
    await logAudit({
      institutionId,
      actorId: user.id,
      actorRole: role,
      action: 'LOGIN',
      target: 'Self',
      ip,
    });
  } catch (err) {
    console.error('Post-login side effect failed:', err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const bodyResult = await readJsonBody(req, AUTH_MAX_BODY_BYTES);
    if (!bodyResult.ok) {
      return NextResponse.json({ error: bodyResult.error }, { status: bodyResult.status });
    }
    const parsed = loginSchema.safeParse(bodyResult.data);
    if (!parsed.success) {
      return NextResponse.json(validationError(parsed.error), { status: 400 });
    }

    const { emailOrUsername, password, roleHint, securityAnswer, returnTokens, institutionUsername } = parsed.data;
    const loginIdentifier = emailOrUsername.trim().toLowerCase();
    const normalizedInstitutionUsername = institutionUsername?.trim().toLowerCase();
    const ip = getClientIp(req);
    const lookupRoles = getLoginLookupRoles(roleHint);

    // Asked for before any lookup, so the prompt never doubles as a
    // "this identifier is a Super Admin" oracle.
    if (roleHint === 'SUPER_ADMIN' && !securityAnswer) {
      return NextResponse.json({ error: 'Security answer required for Super Admin' }, { status: 400 });
    }
    if (roleHint === 'PARENT' && !normalizedInstitutionUsername) {
      return NextResponse.json({ error: 'Institution username is required' }, { status: 400 });
    }
    // Rate-limit before any DB / hash work so brute-force storms don't waste CPU.
    const earlyPlatformKind: PlatformLoginKind | null =
      roleHint === 'SUPER_ADMIN' ? 'super-admin'
      : roleHint === 'EMPLOYEE' ? 'employee'
      : null;
    const earlyRateLimit = earlyPlatformKind
      ? await withPlatformLoginRateLimit(req, earlyPlatformKind, loginIdentifier)
      : await withRateLimit(req, 'auth');
    if (!earlyRateLimit.success) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again in one minute.' },
        { status: 429 },
      );
    }

    let user: { id: number; email?: string; contactEmail?: string; isSuperAdmin?: boolean } | null = null;
    let role: UserRole | null = null;
    let institutionId: number | undefined;
    let campusId: number | undefined;
    let mustChangePassword = false;

    const cacheKey = roleHint === 'PARENT'
      ? `auth:role:${normalizedInstitutionUsername}:${loginIdentifier}`
      : `auth:role:${loginIdentifier}`;
    const cachedRole = await redis.get(cacheKey).catch(() => null);
    
    const hasUsableCachedRole = Boolean(cachedRole && lookupRoles.includes(cachedRole as UserRole));
    if (hasUsableCachedRole) {
      const idx = lookupRoles.indexOf(cachedRole as UserRole);
      lookupRoles.splice(idx, 1);
      lookupRoles.unshift(cachedRole as UserRole);
    }

    let admin: SuperAdminLogin | undefined;
    let emp: EmployeeLogin | undefined;
    let inst: InstitutionLogin | undefined;
    let instAdmin: InstitutionAdminLogin | undefined;
    let stf: StaffLogin | undefined;
    let stu: StudentLogin | undefined;
    let parent: ParentLogin | undefined;
    
    if (!roleHint && !hasUsableCachedRole) {
      const candidate = await findUnhintedLoginCandidate(loginIdentifier);

      if (candidate?.role === 'SUPER_ADMIN') {
        admin = {
          id: candidate.id,
          passwordHash: candidate.password_hash,
          securityAnswerHash: candidate.security_answer_hash!,
          isSuperAdmin: candidate.is_super_admin!,
        };
      } else if (candidate?.role === 'EMPLOYEE') {
        emp = {
          id: candidate.id,
          email: candidate.email!,
          passwordHash: candidate.password_hash,
          mustChangePassword: candidate.must_change_password!,
        };
      } else if (candidate?.role === 'INSTITUTION') {
        inst = {
          id: candidate.id,
          contactEmail: candidate.contact_email!,
          adminPasswordHash: candidate.password_hash,
          status: candidate.account_status!,
          mustChangePassword: candidate.must_change_password ?? false,
        };
      } else if (candidate?.role === 'INSTITUTION_ADMIN') {
        instAdmin = {
          id: candidate.id,
          passwordHash: candidate.password_hash,
          institutionId: candidate.institution_id!,
        };
      } else if (candidate?.role === 'STAFF') {
        stf = {
          id: candidate.id,
          passwordHash: candidate.password_hash,
          isActive: candidate.is_active!,
          institutionId: candidate.institution_id!,
          campusId: candidate.campus_id,
          mustChangePassword: candidate.must_change_password!,
        };
      } else if (candidate?.role === 'STUDENT') {
        stu = {
          id: candidate.id,
          passwordHash: candidate.password_hash,
          isActive: candidate.is_active!,
          institutionId: candidate.institution_id!,
          mustChangePassword: candidate.must_change_password!,
          academicStatus: candidate.account_status as 'ACTIVE' | 'GRADUATED',
          graduatedAccessAllowed: candidate.graduated_access_allowed!,
        };
      }
    } else for (const lookupRole of lookupRoles) {
      if (lookupRole === 'SUPER_ADMIN') {
        const rows = await db.select({
          id: superAdmins.id,
          email: superAdmins.email,
          passwordHash: superAdmins.passwordHash,
          securityAnswerHash: superAdmins.securityAnswerHash,
          isSuperAdmin: superAdmins.isSuperAdmin,
        }).from(superAdmins).where(sql`lower(${superAdmins.email}) = ${loginIdentifier}`).limit(1);
        if (rows.length > 0) {
          admin = rows[0];
          break;
        }
      } else if (lookupRole === 'EMPLOYEE') {
        const rows = await db.select({
          id: employees.id,
          email: employees.email,
          passwordHash: employees.passwordHash,
          mustChangePassword: employees.mustChangePassword,
        }).from(employees).where(sql`lower(${employees.email}) = ${loginIdentifier}`).limit(1);
        if (rows.length > 0) {
          emp = rows[0];
          break;
        }
      } else if (lookupRole === 'INSTITUTION') {
        const rows = await db.select({
          id: institutions.id,
          contactEmail: institutions.contactEmail,
          adminPasswordHash: institutions.adminPasswordHash,
          status: institutions.status,
          mustChangePassword: institutions.mustChangePassword,
        }).from(institutions).where(sql`lower(${institutions.contactEmail}) = ${loginIdentifier}`).limit(1);
        if (rows.length > 0) {
          inst = rows[0];
          break;
        }
      } else if (lookupRole === 'INSTITUTION_ADMIN') {
        const rows = await db.select({
          id: institutionAdmins.id,
          email: institutionAdmins.email,
          passwordHash: institutionAdmins.passwordHash,
          institutionId: institutionAdmins.institutionId,
        }).from(institutionAdmins).where(sql`lower(${institutionAdmins.email}) = ${loginIdentifier}`).limit(1);
        if (rows.length > 0) {
          instAdmin = rows[0];
          break;
        }
      } else if (lookupRole === 'STAFF') {
        const rows = await db.select({
          id: staff.id,
          email: staff.email,
          passwordHash: staff.passwordHash,
          isActive: staff.isActive,
          institutionId: staff.institutionId,
          campusId: staff.campusId,
          mustChangePassword: staff.mustChangePassword,
        }).from(staff).where(sql`lower(${staff.email}) = ${loginIdentifier}`).limit(1);
        if (rows.length > 0) {
          stf = rows[0];
          break;
        }
      } else if (lookupRole === 'STUDENT') {
        const rows = await db.select({
          id: students.id,
          loginRollNumber: students.loginRollNumber,
          passwordHash: students.passwordHash,
          isActive: students.isActive,
          institutionId: students.institutionId,
          mustChangePassword: students.mustChangePassword,
          academicStatus: students.academicStatus,
          graduatedAccessAllowed: institutions.allowGraduatedStudentAccess,
        })
          .from(students)
          .innerJoin(institutions, eq(students.institutionId, institutions.id))
          .where(sql`lower(${students.loginRollNumber}) = ${loginIdentifier}`)
          .limit(1);
        if (rows.length > 0) {
          stu = rows[0];
          break;
        }
      } else if (lookupRole === 'PARENT' && normalizedInstitutionUsername) {
        const rows = await db.select({
          id: parentAccounts.id,
          email: parentAccounts.email,
          passwordHash: parentAccounts.passwordHash,
          institutionId: parentAccounts.institutionId,
          mustChangePassword: parentAccounts.mustChangePassword,
          status: parentAccounts.status,
          institutionStatus: institutions.status,
        })
          .from(parentAccounts)
          .innerJoin(institutions, eq(parentAccounts.institutionId, institutions.id))
          .where(and(
            sql`lower(btrim(${parentAccounts.email})) = ${loginIdentifier}`,
            isNull(parentAccounts.deletedAt),
            or(
              sql`lower(btrim(${institutions.username})) = ${normalizedInstitutionUsername}`,
              sql`lower(btrim(${institutions.publicSlug})) = ${normalizedInstitutionUsername}`,
            ),
          ))
          .limit(1);
        if (rows.length > 0) {
          parent = rows[0];
          break;
        }
      }
    }

    let platformLoginKind: PlatformLoginKind | null = null;
    if (admin) {
      platformLoginKind = admin.isSuperAdmin ? 'super-admin' : 'mini-admin';
    } else if (emp || roleHint === 'EMPLOYEE') {
      platformLoginKind = 'employee';
    } else if (roleHint === 'SUPER_ADMIN') {
      // Unknown admin identifiers get the strictest limit to prevent enumeration
      // from weakening protection on the Super Admin login route.
      platformLoginKind = 'super-admin';
    }

    // Re-check platform bucket when discovery found an admin/employee without a roleHint
    // (early check used the generic auth bucket in that case).
    if (platformLoginKind && !earlyPlatformKind) {
      const platformRateLimit = await withPlatformLoginRateLimit(req, platformLoginKind, loginIdentifier);
      if (!platformRateLimit.success) {
        return NextResponse.json(
          { error: 'Too many login attempts. Please try again in one minute.' },
          { status: 429 },
        );
      }
    }

    if (admin) {
      if (!securityAnswer) {
        // Reachable only without roleHint (the Super Admin form is handled above);
        // stay generic so it cannot confirm the identifier.
        return NextResponse.json(INVALID_CREDENTIALS, { status: 401 });
      }
      await assertNotLocked('SUPER_ADMIN', admin.id);
      const isValidPassword = await verify(admin.passwordHash, password);
      const isValidAnswer = await verify(admin.securityAnswerHash, securityAnswer.toLowerCase().trim());
      if (isValidPassword && isValidAnswer) {
        user = admin;
        role = 'SUPER_ADMIN';
      } else {
        return await rejectFailedLogin('SUPER_ADMIN', admin.id, undefined, ip);
      }
    } else if (emp) {
      await assertNotLocked('EMPLOYEE', emp.id);
      const isValid = await verify(emp.passwordHash, password);
      if (isValid) {
        user = emp;
        role = 'EMPLOYEE';
        mustChangePassword = emp.mustChangePassword;
      } else {
        return await rejectFailedLogin('EMPLOYEE', emp.id, undefined, ip);
      }
    } else if (inst) {
      await assertNotLocked('INSTITUTION', inst.id);
      const isValid = await verify(inst.adminPasswordHash, password);
      if (!isValid) {
        return await rejectFailedLogin('INSTITUTION', inst.id, inst.id, ip);
      }
      // Status is reported only to someone who proved they own the account, so it
      // is no longer an enumeration oracle — but the reason is still specific.
      if (inst.status !== 'APPROVED') {
        return NextResponse.json({ error: 'Institution account is not APPROVED' }, { status: 403 });
      }
      user = inst;
      role = 'INSTITUTION';
      institutionId = inst.id;
      mustChangePassword = inst.mustChangePassword;
    } else if (instAdmin) {
      await assertNotLocked('INSTITUTION_ADMIN', instAdmin.id);
      const isValid = await verify(instAdmin.passwordHash, password);
      if (isValid) {
        user = instAdmin;
        role = 'INSTITUTION_ADMIN';
        institutionId = instAdmin.institutionId;
      } else {
        return await rejectFailedLogin('INSTITUTION_ADMIN', instAdmin.id, instAdmin.institutionId, ip);
      }
    } else if (stf) {
      await assertNotLocked('STAFF', stf.id);
      const isValid = await verify(stf.passwordHash, password);
      if (!isValid) {
        return await rejectFailedLogin('STAFF', stf.id, stf.institutionId, ip);
      }
      if (!stf.isActive) {
        return NextResponse.json({ error: 'Account deactivated' }, { status: 403 });
      }
      user = stf;
      role = 'STAFF';
      institutionId = stf.institutionId;
      campusId = stf.campusId || undefined;
      mustChangePassword = stf.mustChangePassword;
    } else if (stu) {
      await assertNotLocked('STUDENT', stu.id);
      const isValid = await verify(stu.passwordHash, password);
      if (!isValid) {
        return await rejectFailedLogin('STUDENT', stu.id, stu.institutionId, ip);
      }
      if (!stu.isActive) {
        return NextResponse.json({ error: 'Account deactivated' }, { status: 403 });
      }
      if (stu.academicStatus === 'GRADUATED' && !stu.graduatedAccessAllowed) {
        return NextResponse.json({ error: 'Graduate access is restricted by your institution' }, { status: 403 });
      }
      user = stu;
      role = 'STUDENT';
      institutionId = stu.institutionId;
      mustChangePassword = stu.mustChangePassword;
    } else if (parent) {
      if (!parent.passwordHash || parent.status === 'DISABLED') {
        return NextResponse.json(INVALID_CREDENTIALS, { status: 401 });
      }
      await assertNotLocked('PARENT', parent.id);
      const isValid = await verify(parent.passwordHash, password);
      if (!isValid) {
        return await rejectFailedLogin('PARENT', parent.id, parent.institutionId, ip);
      }
      if (parent.institutionStatus !== 'APPROVED') {
        return NextResponse.json({ error: 'Institution account is unavailable' }, { status: 403 });
      }
      user = parent;
      role = 'PARENT';
      institutionId = parent.institutionId;
      mustChangePassword = parent.mustChangePassword;
    }

    if (!user || !role) {
      return NextResponse.json(INVALID_CREDENTIALS, { status: 401 });
    }

    mustChangePassword = requiresPasswordChange(role, mustChangePassword);

    if (redis.status === 'ready') {
      await redis.setex(cacheKey, 300, role).catch(() => null);
    }

    const createdAt = (await getUserCreatedAt({ userId: user.id, role, institutionId })).toISOString();

    const payload: JWTPayload = {
      userId: user.id,
      role,
      institutionId,
      campusId,
      mustChangePassword,
      isSuperAdmin: role === 'SUPER_ADMIN' ? user.isSuperAdmin : undefined,
      createdAt,
      studentAcademicStatus: role === 'STUDENT' ? stu?.academicStatus : undefined,
      graduatedStudentAccessAllowed: role === 'STUDENT' ? stu?.graduatedAccessAllowed : undefined,
    };

    const scopedPayload = await resolveCampusSession(payload);
    if (!scopedPayload) return NextResponse.json({ error: 'Institution account is not APPROVED' }, { status: 403 });
    const { accessToken, refreshToken } = await createTokens(scopedPayload);

    await setAuthCookies(accessToken, refreshToken);
    after(() => clearFailedLoginsBestEffort(role, user.id));

    after(() => runPostLoginSideEffects({
      role,
      user,
      institutionId,
      ip,
    }));

    return NextResponse.json(
      {
        message: 'Logged in successfully',
        role,
        mustChangePassword,
        ...(returnTokens ? { accessToken, refreshToken } : {}),
      },
      // Tokens can appear in this body for mobile/desktop clients — never cache it.
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    const publicInputError = inputErrorResponse(err);
    if (publicInputError) return NextResponse.json(publicInputError.body, { status: publicInputError.status });

    if (err instanceof Error && err.message.startsWith('Account temporarily locked')) {
      return NextResponse.json({ error: err.message }, { status: 423 });
    }
    console.error('Login Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
