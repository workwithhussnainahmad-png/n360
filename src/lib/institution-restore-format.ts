import { ZipReader, Uint8ArrayReader } from '@zip.js/zip.js';
import { MAX_RESTORE_ZIP_BYTES, MAX_RESTORE_DATA_BYTES, MAX_RESTORE_ROWS } from './institution-restore-limits';
export { MAX_RESTORE_ZIP_BYTES, MAX_RESTORE_DATA_BYTES, MAX_RESTORE_ROWS } from './institution-restore-limits';

// Parents precede children. Identity, admissions, finance and operational tables
// are deliberately preserved. A restore never recreates login accounts.
export const RESTORE_TABLES = [
  'assignments', 'submissions', 'attendances', 'staff_attendances',
  'tests', 'marks', 'online_tests', 'online_test_questions', 'online_test_submissions',
  'batch_exams', 'batch_exam_subjects', 'batch_exam_results', 'diaries',
  'courses', 'course_classes', 'course_lectures', 'course_lecture_progress',
] as const;
export type RestoreTable = typeof RESTORE_TABLES[number];
export type RestoreRow = Record<string, unknown>;
export type RestorePayload = {
  institution: { id: number; username: string; name: string };
  generatedAt: string;
  tables: Record<RestoreTable, RestoreRow[]>;
  preserved: Record<string, number>;
};
export class RestoreError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function parseRestoreJsonl(text: string, institutionId: number): RestorePayload {
  if (Buffer.byteLength(text) > MAX_RESTORE_DATA_BYTES) throw new RestoreError('Backup data exceeds 64 MB.');
  const tables = Object.fromEntries(RESTORE_TABLES.map(table => [table, []])) as unknown as RestorePayload['tables'];
  const counts: Record<string, number> = Object.create(null);
  const ids = new Map<string, Set<number>>();
  let header: Record<string, unknown> | undefined;
  let manifest: Record<string, unknown> | undefined;
  let rowCount = 0;
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let item: unknown;
    try { item = JSON.parse(line); } catch { throw new RestoreError('Backup contains invalid JSON.'); }
    if (!object(item) || manifest) throw new RestoreError('Invalid backup record order.');
    if (!header) {
      if (item.type !== 'header' || item.format !== 'nisaab360-institution-export' || item.version !== 2 ||
          item.sensitiveFieldsIncluded !== false || !object(item.institution) || item.institution.id !== institutionId ||
          typeof item.institution.username !== 'string' || typeof item.institution.name !== 'string' ||
          typeof item.generatedAt !== 'string' || !Number.isFinite(Date.parse(item.generatedAt))) {
        throw new RestoreError('Use a version 2 Google Drive backup belonging to this institution.');
      }
      header = item;
      continue;
    }
    if (item.type === 'manifest') { manifest = item; continue; }
    if (item.type !== 'row' || typeof item.table !== 'string' || !/^[a-z_][a-z0-9_]*$/.test(item.table) || !object(item.data)) {
      throw new RestoreError('Invalid backup row.');
    }
    if (++rowCount > MAX_RESTORE_ROWS) throw new RestoreError('Backup exceeds 100,000 records.');
    if ('institution_id' in item.data && item.data.institution_id !== institutionId) throw new RestoreError('Backup contains another institution’s records.');
    counts[item.table] = (counts[item.table] ?? 0) + 1;
    if (RESTORE_TABLES.includes(item.table as RestoreTable)) {
      const id = item.data.id;
      if (!Number.isSafeInteger(id) || Number(id) <= 0 || Number(id) > 2147483647) throw new RestoreError('Invalid record identifier.');
      const seen = ids.get(item.table) ?? new Set<number>();
      if (seen.has(Number(id))) throw new RestoreError('Backup contains duplicate record identifiers.');
      seen.add(Number(id)); ids.set(item.table, seen);
      if (Object.keys(item.data).some(key => !/^[a-z_][a-z0-9_]*$/.test(key) || /password|token|credentials|secret/.test(key))) {
        throw new RestoreError('Unexpected or sensitive field in restore data.');
      }
      tables[item.table as RestoreTable].push(item.data);
    }
  }
  if (!header || !manifest || !object(manifest.tableCounts) || manifest.recordCount !== rowCount ||
      manifest.tableCount !== Object.keys(manifest.tableCounts).length) throw new RestoreError('Backup manifest is incomplete.');
  for (const [table, count] of Object.entries(manifest.tableCounts)) {
    if (!/^[a-z_][a-z0-9_]*$/.test(table) || !Number.isSafeInteger(count) || Number(count) < 0 || (counts[table] ?? 0) !== count) {
      throw new RestoreError('Backup counts do not match its manifest.');
    }
  }
  if (Object.keys(counts).some(table => !(table in (manifest!.tableCounts as object))) ||
      RESTORE_TABLES.some(table => !(table in (manifest!.tableCounts as object)))) throw new RestoreError('Backup is missing required restore tables.');
  return {
    institution: header.institution as RestorePayload['institution'], generatedAt: header.generatedAt as string, tables,
    preserved: Object.fromEntries(Object.entries(manifest.tableCounts).filter(([table]) => !RESTORE_TABLES.includes(table as RestoreTable))) as Record<string, number>,
  };
}

export async function readRestoreZip(bytes: Uint8Array, password: string, institutionId: number) {
  if (!bytes.length || bytes.length > MAX_RESTORE_ZIP_BYTES) throw new RestoreError('ZIP must be no larger than 16 MB.', 413);
  if (password.length < 1 || password.length > 200) throw new RestoreError('A valid archive password is required.');
  const reader = new ZipReader(new Uint8ArrayReader(bytes), { password, useWebWorkers: false, checkSignature: true, checkAuthenticationCode: true, strictness: 'strict' });
  try {
    const entries = [];
    for await (const entry of reader.getEntriesGenerator()) {
      entries.push(entry);
      if (entries.length > 3) throw new RestoreError('Unexpected files in backup ZIP.');
    }
    const expected = new Set(['data.jsonl', 'backup-info.json', 'README.txt']);
    let total = 0;
    for (const entry of entries) {
      if (entry.directory || !entry.encrypted || entry.extraFieldAES?.strength !== 3 || !expected.delete(entry.filename) || !Number.isSafeInteger(entry.uncompressedSize)) {
        throw new RestoreError('Use the original password-protected Google Drive ZIP.');
      }
      total += entry.uncompressedSize;
      if (total > MAX_RESTORE_DATA_BYTES || (entry.filename !== 'data.jsonl' && entry.uncompressedSize > 64 * 1024)) {
        throw new RestoreError('Uncompressed backup exceeds the size limit.', 413);
      }
    }
    if (expected.size) throw new RestoreError('Backup ZIP is incomplete.');
    let text = '';
    // Bound actual decompressed bytes, not just attacker-controlled ZIP metadata.
    for (const entry of entries) {
      if (!('getData' in entry)) throw new RestoreError('Unexpected directory in backup ZIP.');
      const chunks: Uint8Array[] = [];
      let size = 0;
      const limit = entry.filename === 'data.jsonl' ? MAX_RESTORE_DATA_BYTES : 64 * 1024;
      await entry.getData!(new WritableStream<Uint8Array>({ write(chunk) {
        size += chunk.byteLength;
        if (size > limit) throw new RestoreError('Decompressed backup exceeds the size limit.', 413);
        if (entry.filename === 'data.jsonl') chunks.push(chunk);
      } }), { signal: AbortSignal.timeout(120_000), checkSignature: true });
      if (size !== entry.uncompressedSize) throw new RestoreError('Backup ZIP size verification failed.');
      if (entry.filename === 'data.jsonl') text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
    }
    return parseRestoreJsonl(text, institutionId);
  } catch (error) {
    if (error instanceof RestoreError) throw error;
    throw new RestoreError('Could not verify ZIP. Check the password and upload an intact backup.');
  } finally { await reader.close(); }
}
