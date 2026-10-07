import { and, eq } from 'drizzle-orm';
import { db, pool } from '@/db';
import { refreshTokens } from '@/db/schema';
import { createTokens, rotateRefreshToken } from '@/lib/auth';

const TEST_USER_ID = 2_147_483_000;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
try {
  await db.delete(refreshTokens).where(and(
    eq(refreshTokens.userRole, 'SUPER_ADMIN'),
    eq(refreshTokens.userId, TEST_USER_ID),
  ));

  const initial = await createTokens({ userId: TEST_USER_ID, role: 'SUPER_ADMIN' });
  const rotated = await rotateRefreshToken(initial.refreshToken);
  assert(rotated.status === 'ROTATED', 'The first use must rotate the token');
  assert(rotated.refreshToken !== initial.refreshToken, 'Rotation must issue a new token');

  const afterRotation = await db
    .select()
    .from(refreshTokens)
    .where(and(
      eq(refreshTokens.userRole, 'SUPER_ADMIN'),
      eq(refreshTokens.userId, TEST_USER_ID),
    ));
  assert(afterRotation.length === 2, 'Rotation must retain the consumed row and create one successor');
  assert(afterRotation.some((row) => row.replacedByHash && row.revokedAt), 'Consumed token must point to its successor');
  assert(afterRotation.some((row) => !row.revokedAt), 'Successor must initially remain active');

  const reused = await rotateRefreshToken(initial.refreshToken);
  assert(reused.status === 'REUSED', 'A replaced token must be detected as reuse');

  const afterReuse = await db
    .select()
    .from(refreshTokens)
    .where(and(
      eq(refreshTokens.userRole, 'SUPER_ADMIN'),
      eq(refreshTokens.userId, TEST_USER_ID),
    ));
  assert(afterReuse.every((row) => row.revokedAt), 'Reuse must revoke every active successor for the account');
  assert(afterReuse.some((row) => row.reuseDetectedAt), 'Reuse detection timestamp must be recorded');

  console.info('Refresh-token rotation verification passed.');
} finally {
  await db.delete(refreshTokens).where(and(
    eq(refreshTokens.userRole, 'SUPER_ADMIN'),
    eq(refreshTokens.userId, TEST_USER_ID),
  ));
  await pool.end();
}
}

void main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
