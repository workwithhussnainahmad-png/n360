import { db } from '@/db';
import { refreshTokens } from '@/db/schema';
import { sql } from 'drizzle-orm';

/**
 * Retention for dead refresh tokens.
 *
 * Refresh tokens themselves live 30 days (`REFRESH_TOKEN_EXPIRY_DAYS` in
 * lib/auth.ts). Keeping rows for a further 30 days past expiry means a token that
 * is presented late still finds its row and is rejected as expired, rather than
 * silently missing — the audit trail for a stale device stays intact for a month.
 */
const RETENTION_DAYS = 30;

/**
 * Rows per statement. Bounded so a first run against a table that has never been
 * pruned cannot take one enormous lock or generate one enormous WAL record; the
 * loop just runs more batches.
 */
const BATCH_SIZE = 5_000;

/**
 * Ceiling on batches per invocation (100k rows). A backlog larger than this is
 * finished on the next hourly pass instead of monopolising a pooled connection.
 */
const MAX_BATCHES = 20;

/**
 * Delete refresh-token rows that expired more than `RETENTION_DAYS` ago.
 *
 * Why this exists: rows are inserted on every login on every device and are never
 * deleted except by explicit revocation, so the table and its `token_hash` unique
 * index grow without bound. Every `/api/auth/refresh` call probes that index, and
 * every nightly backup copies the whole table.
 *
 * Revoked and replaced rows are intentionally retained until this cutoff so a
 * replayed token can be recognised as reuse instead of looking like an unknown
 * token. The same bounded deletion clears both expired and historical rows.
 */
export async function pruneExpiredRefreshTokens(): Promise<{ deleted: number; backlogRemaining: boolean }> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  let deleted = 0;

  for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
    // Batched via a self-subquery: `DELETE ... LIMIT` is not valid Postgres, and
    // the subquery lets the index on expires_at pick exactly the rows to remove.
    const result = await db.execute(sql`
      DELETE FROM ${refreshTokens}
      WHERE id IN (
        SELECT id FROM ${refreshTokens}
        WHERE ${refreshTokens.expiresAt} < ${cutoff}
        LIMIT ${BATCH_SIZE}
      )
    `);

    const affected = (result as unknown as { rowCount?: number | null }).rowCount ?? 0;
    deleted += affected;
    if (affected < BATCH_SIZE) return { deleted, backlogRemaining: false };
  }

  return { deleted, backlogRemaining: true };
}
