import { createHash } from 'node:crypto';
import pg, { type PoolClient } from 'pg';
import { encryptStreamingCredentials, decryptStreamingCredentials } from './streaming-credentials';
import { RESTORE_TABLES, RestoreError, type RestorePayload } from './institution-restore-format';
import { stageRestore, lockRestoreTables, captureRestoreRecovery, applyStagedRestore, type RestorePreview } from './institution-restore-engine';
import { redis } from './redis';

type RestoreJob = {
  id: number; institution_id: number; status: string; payload_encrypted: string | null;
  preview: RestorePreview | null; preview_hash: string | null; execution_requested_by: number | null; execution_requested_by_employee: number | null; execution_requested_role: 'SUPER_ADMIN' | 'EMPLOYEE' | null;
};
export type RestoreActor = { id: number; role: 'INSTITUTION' | 'INSTITUTION_ADMIN' | 'SUPER_ADMIN' | 'EMPLOYEE'; ip: string };
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
let restorePool: pg.Pool | undefined;
export function getRestorePool() {
  const connectionString = process.env.DIRECT_URL?.trim();
  if (!connectionString || /(:6432\b|pgbouncer=true)/i.test(connectionString)) throw new RestoreError('Restoration requires a direct PostgreSQL connection.', 503);
  if (!restorePool) {
    restorePool = new pg.Pool({ connectionString, max: 2, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 10_000, application_name: 'nisaab360_institution_restore' });
    restorePool.on('error', () => console.error('Institution restore database connection interrupted.'));
  }
  return restorePool;
}
export async function closeRestorePool() { if (restorePool) { await restorePool.end(); restorePool = undefined; } }
function encode(payload: RestorePayload) { return encryptStreamingCredentials({ restore: JSON.stringify(payload) }); }
function decode(value: string | null): RestorePayload {
  const text = decryptStreamingCredentials(value)?.restore;
  if (!text) throw new RestoreError('Staged recovery data could not be decrypted.');
  return JSON.parse(text) as RestorePayload;
}
async function audit(client: PoolClient, institutionId: number, actor: RestoreActor, action: string, jobId: number) {
  await client.query('INSERT INTO audit_logs(institution_id, actor_id, actor_role, action, target, ip) VALUES ($1,$2,$3,$4,$5,$6)',
    [institutionId, actor.id, actor.role, action, `Institution restore request ${jobId}`, actor.ip]);
}
async function notify(client: PoolClient, institutionId: number, title: string, message: string) {
  await client.query(`INSERT INTO notifications(institution_id,user_role,user_id,type,title,message)
    VALUES ($1,'INSTITUTION',$1,'GENERAL',$2,$3)`, [institutionId, title, message]);
}
export async function submitInstitutionRestore(payload: RestorePayload, archiveHash: string, actor: RestoreActor, sourceId?: number) {
  if ((!sourceId && (actor.role !== 'INSTITUTION' || actor.id !== payload.institution.id)) || (sourceId && actor.role !== 'SUPER_ADMIN')) throw new RestoreError('Only the campus primary account may submit a restore.', 403);
  const client = await getRestorePool().connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(64361,$1)', [payload.institution.id]);
    const active = await client.query("SELECT id FROM institution_restore_requests WHERE institution_id=$1 AND status NOT IN ('COMPLETED','FAILED','REJECTED')", [payload.institution.id]);
    if (active.rows.length) throw new RestoreError('An active restore request already exists for this institution.', 409);
    const recent = (await client.query<{ count: number }>("SELECT count(*)::int AS count FROM institution_restore_requests WHERE institution_id=$1 AND created_at > now() - interval '24 hours'", [payload.institution.id])).rows[0].count;
    if (recent >= 3) throw new RestoreError('Limit of three restore requests per institution per day reached.', 429);
    const row = (await client.query<{ id: number }>(`INSERT INTO institution_restore_requests(institution_id,payload_encrypted,archive_sha256,backup_generated_at,source_restore_id)
      VALUES ($1,$2,$3,$4,$5) RETURNING id`, [payload.institution.id, encode(payload), archiveHash, payload.generatedAt, sourceId ?? null])).rows[0];
    await audit(client, payload.institution.id, actor, 'REQUEST_INSTITUTION_RESTORE', row.id);
    await client.query('COMMIT');
    return row.id;
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}
export async function listInstitutionRestores(institutionId?: number) {
  const result = await getRestorePool().query(`SELECT r.id, r.institution_id, i.name AS institution_name, r.status,
    r.backup_generated_at, r.preview, r.preview_hash, r.approved_at, r.error, r.created_at, r.completed_at,
    (r.recovery_encrypted IS NOT NULL AND r.recovery_expires_at > now()) AS recovery_available
    FROM institution_restore_requests r JOIN institutions i ON i.id=r.institution_id
    WHERE ($1::int IS NULL OR r.institution_id=$1)
    ORDER BY CASE WHEN r.status IN ('COMPLETED','FAILED','REJECTED') THEN 1 ELSE 0 END, r.created_at DESC LIMIT 50`, [institutionId ?? null]);
  return result.rows;
}
export async function actOnInstitutionRestore(id: number, institutionId: number | undefined, action: string, previewHash: unknown, actor: RestoreActor) {
  if (!['INSTITUTION','SUPER_ADMIN'].includes(actor.role)) throw new RestoreError('Only the campus primary account or a platform admin may act on restores.', 403);
  if (actor.role === 'INSTITUTION' && (institutionId === undefined || actor.id !== institutionId)) throw new RestoreError('Tenant scope is required and must match the primary account.', 403);
  const client = await getRestorePool().connect();
  try {
    await client.query('BEGIN');
    const job = (await client.query<RestoreJob>('SELECT * FROM institution_restore_requests WHERE id=$1 AND ($2::int IS NULL OR institution_id=$2) FOR UPDATE', [id, institutionId ?? null])).rows[0];
    if (!job) throw new RestoreError('Restore request not found.', 404);
    if (action === 'approve') {
      if (actor.role !== 'INSTITUTION' || job.status !== 'AWAITING_APPROVAL' || typeof previewHash !== 'string' || job.preview_hash !== previewHash) throw new RestoreError('Approve the current preview as the campus primary account.', 409);
      await client.query("UPDATE institution_restore_requests SET status='APPROVED',approved_at=now(),updated_at=now() WHERE id=$1", [id]);
    } else if (action === 'execute') {
      if (actor.role !== 'SUPER_ADMIN' || job.status !== 'APPROVED' || job.preview_hash !== previewHash) throw new RestoreError('Execution requires owner approval of the current preview.', 409);
      await client.query("UPDATE institution_restore_requests SET status='EXECUTION_PENDING',execution_requested_by=$2,execution_requested_by_employee=$3,execution_requested_role=$4,updated_at=now() WHERE id=$1", [id, actor.id, null, 'SUPER_ADMIN']);
    } else if (action === 'reject') {
      if (!['PREVIEW_PENDING', 'AWAITING_APPROVAL', 'APPROVED'].includes(job.status)) throw new RestoreError('This request can no longer be cancelled.', 409);
      await client.query("UPDATE institution_restore_requests SET status='REJECTED',payload_encrypted=NULL,updated_at=now(),completed_at=now() WHERE id=$1", [id]);
    } else { throw new RestoreError('Unknown restore action.'); }
    await audit(client, job.institution_id, actor, `INSTITUTION_RESTORE_${action.toUpperCase()}`, id);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}
export async function requestRecoveryRestore(id: number, actor: RestoreActor) {
  if (actor.role !== 'SUPER_ADMIN') throw new RestoreError('Forbidden.', 403);
  const job = (await getRestorePool().query<{ recovery_encrypted: string }>(`SELECT recovery_encrypted FROM institution_restore_requests
    WHERE id=$1 AND status='COMPLETED' AND recovery_encrypted IS NOT NULL AND recovery_expires_at > now()`, [id])).rows[0];
  if (!job) throw new RestoreError('Recovery snapshot is unavailable or expired.', 404);
  const payload = decode(job.recovery_encrypted);
  return submitInstitutionRestore(payload, hash(JSON.stringify(payload)), actor, id);
}

async function clearRestoreCaches() {
  if (redis.status !== 'ready') throw new RestoreError('Restore committed; cache cleanup will retry when Redis is available.', 503);
  // Rare recovery operation: invalidate all read data plus fill locks to prevent
  // an earlier in-flight read publishing a pre-restore value after cleanup.
  // Authentication/session keys are outside cache:* and remain untouched.
  let cursor = '0';
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', 'cache:*', 'COUNT', 500);
    cursor = next;
    if (keys.length) await redis.unlink(...keys);
  } while (cursor !== '0');
}

/** One global worker lease bounds memory across replicas. PostgreSQL rolls back
 * imports on failure/disconnect. CACHE_PENDING means the data has committed and
 * MUST NOT be re-imported when a worker restarts. */
export async function processNextInstitutionRestore() {
  const client = await getRestorePool().connect();
  let locked = false;
  let cleanupOnExit = false;
  let job: RestoreJob | undefined;
  try {
    locked = (await client.query<{ locked: boolean }>('SELECT pg_try_advisory_lock(64362,1) AS locked')).rows[0].locked;
    if (!locked) return { processed: 0 };
    await client.query("UPDATE institution_restore_requests SET payload_encrypted=NULL WHERE completed_at < now()-interval '7 days'");
    await client.query('UPDATE institution_restore_requests SET recovery_encrypted=NULL WHERE recovery_expires_at < now()');
    const interrupted = (await client.query<{ id: number; institution_id: number }>(`UPDATE institution_restore_requests
      SET status='FAILED',error='Worker stopped before completion; no restore was committed.',completed_at=now(),updated_at=now()
      WHERE status IN ('PREVIEW_RUNNING','EXECUTION_RUNNING') RETURNING id,institution_id`)).rows;
    for (const item of interrupted) await notify(client, item.institution_id, 'Restore request interrupted', `Request #${item.id} stopped before completion. No replacement was committed. Submit a new request to retry.`);
    job = (await client.query<RestoreJob>(`UPDATE institution_restore_requests SET status=CASE status
      WHEN 'PREVIEW_PENDING' THEN 'PREVIEW_RUNNING' WHEN 'EXECUTION_PENDING' THEN 'EXECUTION_RUNNING' ELSE status END,
      started_at=now(),updated_at=now() WHERE id=(SELECT id FROM institution_restore_requests
      WHERE status IN ('PREVIEW_PENDING','EXECUTION_PENDING','CACHE_PENDING') ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`)).rows[0];
    if (!job) return { processed: 0 };
    if (job.status === 'CACHE_PENDING') { await finishCacheCleanup(client, job); return { processed: 1 }; }
    const payload = decode(job.payload_encrypted);
    if (payload.institution.id !== job.institution_id) throw new RestoreError('Staged data belongs to a different institution.');
    const executionRole = job.execution_requested_role ?? 'SUPER_ADMIN';
    const executorId = executionRole === 'EMPLOYEE' ? job.execution_requested_by_employee : job.execution_requested_by;
    if (job.status === 'EXECUTION_RUNNING' && (executionRole !== 'SUPER_ADMIN' || !executorId)) throw new RestoreError('The executing administrator account no longer exists.');
    if (job.status === 'EXECUTION_RUNNING') {
      const executor = await client.query('SELECT id FROM super_admins WHERE id=$1', [executorId]);
      const approval = await client.query(`SELECT id FROM audit_logs WHERE institution_id=$1 AND actor_id=$1 AND actor_role='INSTITUTION'
        AND action='INSTITUTION_RESTORE_APPROVE' AND target=$2 AND timestamp >= (SELECT approved_at FROM institution_restore_requests WHERE id=$3)
        ORDER BY id DESC LIMIT 1`, [job.institution_id, `Institution restore request ${job.id}`, job.id]);
      if (!executor.rows.length || !approval.rows.length) throw new RestoreError('Current owner approval and an active platform administrator are required.', 403);
    }
    // Execution reads only after all data/identity locks have been acquired.
    // READ COMMITTED avoids a snapshot taken by catalog inspection before the
    // external identity locks, which could otherwise observe outdated ownership.
    await client.query(job.status === 'EXECUTION_RUNNING' ? 'BEGIN' : 'BEGIN ISOLATION LEVEL REPEATABLE READ');
    await client.query("SET LOCAL lock_timeout='10s'; SET LOCAL statement_timeout='120s'; SET LOCAL idle_in_transaction_session_timeout='180s'");
    if (job.status === 'EXECUTION_RUNNING') await lockRestoreTables(client);
    const preview = await stageRestore(client, payload);
    if (job.status === 'PREVIEW_RUNNING') {
      await client.query('ROLLBACK'); // Every staging table/row is discarded.
      await client.query('BEGIN');
      await savePreview(client, job, preview);
      await client.query('COMMIT');
    } else if (!job.preview || preview.fingerprint !== job.preview.fingerprint) {
      await client.query('ROLLBACK');
      await client.query('BEGIN');
      await savePreview(client, job, preview, 'Current records changed. Review and approve this new preview before execution.');
      await client.query('COMMIT');
    } else {
      const recovery = await captureRestoreRecovery(client, payload);
      const encryptedRecovery = encode(recovery);
      await client.query(`UPDATE institution_restore_requests SET recovery_encrypted=$2,recovery_expires_at=now()+interval '30 days' WHERE id=$1`, [job.id, encryptedRecovery]);
      await applyStagedRestore(client, payload);
      await audit(client, job.institution_id, { id: executorId!, role: executionRole, ip: 'worker' }, 'INSTITUTION_RESTORE_COMMITTED', job.id);
      await client.query("UPDATE institution_restore_requests SET status='CACHE_PENDING',updated_at=now(),error=NULL WHERE id=$1", [job.id]);
      await client.query('COMMIT');
      job.status = 'CACHE_PENDING';
      await finishCacheCleanup(client, job);
    }
    return { processed: 1, restoreId: job.id };
  } catch (error) {
    cleanupOnExit = true;
    await client.query('ROLLBACK').catch(() => undefined);
    if (job) {
      // COMMIT may have succeeded even if its acknowledgement was lost. Consult
      // durable state before classifying a failure or ever retrying an import.
      const durable = (await client.query<{ status: string }>('SELECT status FROM institution_restore_requests WHERE id=$1', [job.id])).rows[0];
      if (durable?.status === 'CACHE_PENDING' || durable?.status === 'COMPLETED') job.status = durable.status;
      if (job.status === 'COMPLETED') return { processed: 1, restoreId: job.id };
      const message = error instanceof RestoreError ? error.message : 'Restore database validation failed. No replacement was committed; ask the administrator to inspect server logs.';
      if (job.status !== 'CACHE_PENDING') {
        await client.query('BEGIN');
        await client.query("UPDATE institution_restore_requests SET status='FAILED',error=$2,completed_at=now(),updated_at=now() WHERE id=$1 AND status <> 'CACHE_PENDING'", [job.id, message]);
        await notify(client, job.institution_id, 'Restore request failed', `Request #${job.id}: ${message}`);
        await client.query('COMMIT');
      } else {
        await client.query('UPDATE institution_restore_requests SET error=$2,updated_at=now() WHERE id=$1', [job.id, 'Data restored. Cache cleanup is pending and will retry automatically.']);
      }
      // Do not log database row details or uploaded content/passwords.
      console.error('Institution restore processing failed', { restoreId: job.id, code: error instanceof Error && 'code' in error ? error.code : 'RESTORE_VALIDATION' });
      return { processed: 1, restoreId: job.id };
    }
    throw error;
  } finally {
    if (cleanupOnExit) await client.query('ROLLBACK').catch(() => undefined);
    if (locked) await client.query('SELECT pg_advisory_unlock(64362,1)').catch(() => undefined);
    client.release();
  }
}
async function savePreview(client: PoolClient, job: RestoreJob, preview: RestorePreview, message?: string) {
  await client.query(`UPDATE institution_restore_requests SET status='AWAITING_APPROVAL',preview=$2::jsonb,preview_hash=$3,
    approved_at=NULL,execution_requested_by=NULL,execution_requested_by_employee=NULL,execution_requested_role=NULL,error=$4,updated_at=now() WHERE id=$1`, [job.id, JSON.stringify(preview), hash(JSON.stringify(preview)), message ?? null]);
  await notify(client, job.institution_id, 'Restore preview ready', `Review request #${job.id} in institution settings. Your approval is required before an administrator can execute it.`);
}
async function finishCacheCleanup(client: PoolClient, job: RestoreJob) {
  await clearRestoreCaches();
  await client.query('BEGIN');
  await client.query("UPDATE institution_restore_requests SET status='COMPLETED',error=NULL,completed_at=now(),updated_at=now() WHERE id=$1 AND status='CACHE_PENDING'", [job.id]);
  await notify(client, job.institution_id, 'Institution restore completed', `Request #${job.id} has completed. ${RESTORE_TABLES.length} academic and learning tables were restored. Accounts and payment records were preserved.`);
  await client.query('COMMIT');
}
