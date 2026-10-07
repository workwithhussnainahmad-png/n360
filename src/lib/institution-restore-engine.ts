import type { PoolClient } from 'pg';
import { createHash } from 'node:crypto';
import { MAX_RESTORE_DATA_BYTES, MAX_RESTORE_ROWS, RESTORE_TABLES, RestoreError, type RestorePayload, type RestoreTable } from './institution-restore-format';

export type RestorePreview = {
  generatedAt: string;
  tables: { table: string; current: number; replacement: number }[];
  preservedTables: string[];
  mediaReferences: number;
  warnings: string[];
  fingerprint: string;
};
export type RestoreSql = Pick<PoolClient, 'query'>;
type Column = { table_name: string; column_name: string };
type ForeignKey = { child: string; parent: string; child_column: string; parent_column: string; width: number; parent_schema: string; child_schema: string };
export function quoteRestoreIdentifier(value: string) {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new RestoreError('Invalid database identifier.');
  return `"${value}"`;
}
const q = quoteRestoreIdentifier;
export const RESTORE_DEPENDENT_PREDICATES: Partial<Record<RestoreTable, string>> = {
  online_test_questions: 'online_test_id IN (SELECT id FROM public.online_tests WHERE institution_id = $1)',
  batch_exam_subjects: 'batch_exam_id IN (SELECT id FROM public.batch_exams WHERE institution_id = $1)',
  batch_exam_results: 'batch_exam_subject_id IN (SELECT s.id FROM public.batch_exam_subjects s JOIN public.batch_exams e ON e.id = s.batch_exam_id WHERE e.institution_id = $1)',
  course_classes: 'course_id IN (SELECT id FROM public.courses WHERE institution_id = $1)',
  course_lectures: 'course_id IN (SELECT id FROM public.courses WHERE institution_id = $1)',
  course_lecture_progress: 'lecture_id IN (SELECT l.id FROM public.course_lectures l JOIN public.courses c ON c.id = l.course_id WHERE c.institution_id = $1)',
};
function predicate(table: RestoreTable) { return RESTORE_DEPENDENT_PREDICATES[table] ?? 'institution_id = $1'; }

async function metadata(client: RestoreSql) {
  const columns = (await client.query<Column>(`SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public' ORDER BY table_name, ordinal_position`)).rows;
  const byTable = new Map<string, string[]>();
  for (const c of columns) byTable.set(c.table_name, [...(byTable.get(c.table_name) ?? []), c.column_name]);
  if (RESTORE_TABLES.some(table => !byTable.has(table))) throw new RestoreError('The server restore schema is incomplete. Apply migrations first.');
  const keys = (await client.query<ForeignKey>(`SELECT child.relname AS child, parent.relname AS parent,
    ca.attname AS child_column, pa.attname AS parent_column, cardinality(c.conkey) AS width, pn.nspname AS parent_schema, cn.nspname AS child_schema
    FROM pg_constraint c JOIN pg_class child ON child.oid=c.conrelid JOIN pg_namespace cn ON cn.oid=child.relnamespace
    JOIN pg_class parent ON parent.oid=c.confrelid JOIN pg_namespace pn ON pn.oid=parent.relnamespace
    JOIN pg_attribute ca ON ca.attrelid=c.conrelid AND ca.attnum=c.conkey[1]
    JOIN pg_attribute pa ON pa.attrelid=c.confrelid AND pa.attnum=c.confkey[1]
    WHERE c.contype='f' AND ((cn.nspname='public' AND child.relname=ANY($1::text[])) OR
      (pn.nspname='public' AND parent.relname=ANY($1::text[])))`, [RESTORE_TABLES])).rows;
  // Refuse schema changes that would cause deletion to cascade into preserved data.
  if (keys.some(k => k.width !== 1 || k.parent_schema !== 'public' || k.child_schema !== 'public' || !RESTORE_TABLES.includes(k.child as RestoreTable))) {
    throw new RestoreError('The server has relationships outside the supported restore scope. An updated importer is required.');
  }
  return { byTable, keys };
}

export async function lockRestoreTables(client: RestoreSql) {
  // PostgreSQL waits for earlier writers and blocks later writes across every
  // replica and worker. Reads continue. These short table locks also cover child
  // rows that have no institution_id. No application-only pause can miss a writer.
  await client.query(`LOCK TABLE ${[...RESTORE_TABLES].sort().map(t => `public.${q(t)}`).join(', ')} IN SHARE ROW EXCLUSIVE MODE`);
  const { keys } = await metadata(client);
  const parents = [...new Set(keys.filter(k => !RESTORE_TABLES.includes(k.parent as RestoreTable)).map(k => k.parent))].sort();
  if (parents.length) await client.query(`LOCK TABLE ${parents.map(t => `public.${q(t)}`).join(', ')} IN SHARE MODE`);
}

export async function stageRestore(client: RestoreSql, payload: RestorePayload): Promise<RestorePreview> {
  const institutionId = payload.institution.id;
  const institution = (await client.query<{ username: string }>('SELECT username FROM public.institutions WHERE id=$1', [institutionId])).rows[0];
  if (!institution || institution.username !== payload.institution.username) throw new RestoreError('Backup institution identity does not match the current institution.');
  const { byTable, keys } = await metadata(client);
  // Existing inconsistent tenant links must not let ON DELETE CASCADE remove
  // another institution's rows. Check live incoming children as well as the ZIP.
  for (const fk of keys.filter(key => RESTORE_TABLES.includes(key.parent as RestoreTable))) {
    const inconsistent = await client.query(`SELECT 1 FROM public.${q(fk.child)} child
      JOIN public.${q(fk.parent)} parent ON parent.${q(fk.parent_column)}=child.${q(fk.child_column)}
      WHERE parent.id IN (SELECT id FROM public.${q(fk.parent)} WHERE ${predicate(fk.parent as RestoreTable)})
      AND child.id NOT IN (SELECT id FROM public.${q(fk.child)} WHERE ${predicate(fk.child as RestoreTable)}) LIMIT 1`, [institutionId]);
    if (inconsistent.rows.length) throw new RestoreError('Current database contains inconsistent institution relationships. An administrator must repair them before restoration.');
  }
  let mediaReferences = 0;
  for (const table of RESTORE_TABLES) {
    const fields = byTable.get(table)!;
    await client.query(`CREATE TEMP TABLE ${q('restore_' + table)} (LIKE public.${q(table)} INCLUDING ALL) ON COMMIT DROP`);
    for (const row of payload.tables[table]) {
      if (Object.keys(row).length !== fields.length || fields.some(field => !Object.hasOwn(row, field))) {
        throw new RestoreError(`Backup columns for ${table} do not match this server version.`);
      }
      if (fields.includes('institution_id') && row.institution_id !== institutionId) throw new RestoreError('Cross-institution restore is forbidden.');
      mediaReferences += Object.entries(row).filter(([key, value]) => /(_url|_key)$/.test(key) && typeof value === 'string' && value.length > 0).length;
    }
    for (let start = 0; start < payload.tables[table].length; start += 500) {
      const rows = payload.tables[table].slice(start, start + 500);
      await client.query(`INSERT INTO pg_temp.${q('restore_' + table)} (${fields.map(q).join(',')})
        SELECT ${fields.map(q).join(',')} FROM json_populate_recordset(NULL::public.${q(table)}, $1::json)`, [JSON.stringify(rows)]);
    }
    // PKs are globally allocated. Never overwrite a record owned by another tenant.
    const collisions = await client.query(`SELECT 1 FROM public.${q(table)} live JOIN pg_temp.${q('restore_' + table)} staged USING(id)
      WHERE live.id NOT IN (SELECT id FROM public.${q(table)} WHERE ${predicate(table)}) LIMIT 1`, [institutionId]);
    if (collisions.rows.length) throw new RestoreError(`Record identifiers in ${table} belong to another institution.`);
  }
  for (const fk of keys) {
    const internal = RESTORE_TABLES.includes(fk.parent as RestoreTable);
    const parentColumns = byTable.get(fk.parent) ?? [];
    if (!internal && fk.parent !== 'institutions' && !parentColumns.includes('institution_id')) {
      throw new RestoreError(`Cannot prove ownership of ${fk.parent} references.`);
    }
    const parent = internal ? `pg_temp.${q('restore_' + fk.parent)}` : `public.${q(fk.parent)}`;
    const tenant = internal ? '' : fk.parent === 'institutions' ? 'AND p.id=$1' : 'AND p.institution_id=$1';
    const missing = await client.query(`SELECT 1 FROM pg_temp.${q('restore_' + fk.child)} s
      WHERE s.${q(fk.child_column)} IS NOT NULL AND NOT EXISTS
      (SELECT 1 FROM ${parent} p WHERE p.${q(fk.parent_column)}=s.${q(fk.child_column)} ${tenant}) LIMIT 1`, internal ? [] : [institutionId]);
    if (missing.rows.length) throw new RestoreError(`Missing or foreign institution reference: ${fk.child}.${fk.child_column}. Current accounts/classes/subjects must still exist.`);
  }
  const tables: RestorePreview['tables'] = [];
  let currentBytes = 0;
  // Fingerprint counts AND contents. An approval cannot silently cover subsequent
  // edits, even when row counts remain unchanged. Canonical JSONB handles key order.
  const hash = createHash('sha256');
  for (const table of RESTORE_TABLES) {
    const result = await client.query<{ count: number; digest: string; bytes: string }>(`SELECT count(*)::int AS count,
      coalesce(sum(octet_length(to_jsonb(t)::text)),0)::text AS bytes,
      md5(coalesce(string_agg(md5(to_jsonb(t)::text), ',' ORDER BY id), '')) AS digest
      FROM public.${q(table)} t WHERE ${predicate(table)}`, [institutionId]);
    tables.push({ table, current: result.rows[0].count, replacement: payload.tables[table].length });
    currentBytes += Number(result.rows[0].bytes);
    hash.update(table + ':' + result.rows[0].digest + ';');
  }
  if (tables.reduce((sum, table) => sum + table.current, 0) > MAX_RESTORE_ROWS) {
    throw new RestoreError('Current restore scope exceeds 100,000 records. A larger recovery procedure is required.');
  }
  if (currentBytes > MAX_RESTORE_DATA_BYTES) throw new RestoreError('Current recovery data exceeds 64 MB. A larger recovery procedure is required.');
  // External identities/academic structure are part of the approved preview too.
  for (const table of [...new Set(keys.filter(k => !RESTORE_TABLES.includes(k.parent as RestoreTable)).map(k => k.parent))].sort()) {
    const where = table === 'institutions' ? 'id=$1' : 'institution_id=$1';
    const rows = (await client.query<{ digest: string }>(`SELECT md5(coalesce(string_agg(md5(to_jsonb(t)::text), ',' ORDER BY id), '')) AS digest FROM public.${q(table)} t WHERE ${where}`, [institutionId])).rows;
    hash.update(table + ':' + rows[0].digest + ';');
  }
  return {
    generatedAt: payload.generatedAt, tables, preservedTables: Object.keys(payload.preserved).sort(), mediaReferences,
    warnings: [
      'All current records in the listed restore tables will be replaced, including records created after the backup.',
      'Current accounts, passwords, class structure, permissions, admissions, fees, payments and integration credentials are preserved.',
      'Media binaries are not in the backup. Saved URLs and keys are restored without checking whether remote files still exist.',
      'Restoration does not send historical notifications, charge fees or run payment settlement.',
      'During execution, database writes to the listed tables pause briefly across the platform. Reads remain available.',
    ], fingerprint: hash.digest('hex'),
  };
}

export async function captureRestoreRecovery(client: RestoreSql, payload: RestorePayload) {
  const tables: RestorePayload['tables'] = {} as RestorePayload['tables'];
  let bytes = 0;
  for (const table of RESTORE_TABLES) {
    tables[table] = (await client.query(`SELECT * FROM public.${q(table)} WHERE ${predicate(table)} ORDER BY id`, [payload.institution.id])).rows;
    bytes += Buffer.byteLength(JSON.stringify(tables[table]));
    if (bytes > MAX_RESTORE_DATA_BYTES) throw new RestoreError('Pre-restore recovery snapshot exceeds 64 MB. No replacement was committed.');
  }
  return { institution: payload.institution, generatedAt: new Date().toISOString(), tables, preserved: payload.preserved } satisfies RestorePayload;
}

export async function applyStagedRestore(client: RestoreSql, payload: RestorePayload) {
  for (const table of [...RESTORE_TABLES].reverse()) await client.query(`DELETE FROM public.${q(table)} WHERE ${predicate(table)}`, [payload.institution.id]);
  for (const table of RESTORE_TABLES) {
    await client.query(`INSERT INTO public.${q(table)} SELECT * FROM pg_temp.${q('restore_' + table)}`);
    const count = (await client.query<{ count: number }>(`SELECT count(*)::int AS count FROM public.${q(table)} WHERE ${predicate(table)}`, [payload.institution.id])).rows[0].count;
    if (count !== payload.tables[table].length) throw new RestoreError(`Post-restore verification failed for ${table}.`);
  }
  // Sequence values are nontransactional; only advance them once all row checks
  // have passed, never decrease them. Tables remain locked against concurrent inserts.
  for (const table of RESTORE_TABLES) {
    const seq = (await client.query<{ name: string | null }>('SELECT pg_get_serial_sequence($1, $2) AS name', [`public.${table}`, 'id'])).rows[0].name;
    if (seq) {
      const parts = seq.replaceAll('"', '').split('.');
      if (parts.length !== 2) throw new RestoreError('Unexpected sequence name.');
      await client.query(`SELECT setval($1::regclass, greatest((SELECT last_value FROM ${parts.map(q).join('.')}), coalesce((SELECT max(id) FROM public.${q(table)}),1)), true)`, [seq]);
    }
  }
}
