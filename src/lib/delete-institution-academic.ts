import { sql } from 'drizzle-orm';
import { db } from '@/db';

export type AcademicKind = 'subject' | 'class' | 'section';
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
const tables = { subject: 'subjects', class: 'classes', section: 'sections' } as const;
const identifier = (value: string) => sql.raw(`"${value.replaceAll('"', '""')}"`);

export class AcademicDeleteError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}

/** Check every FK, including CASCADE/SET NULL links, before permitting deletion. */
async function assertUnused(tx: Transaction, table: string, ids: number[], skipSections = false) {
  if (!ids.length) return;
  const references = await tx.execute<{ schema_name: string; table_name: string; column_name: string }>(sql`
    SELECT ns.nspname AS schema_name, relation.relname AS table_name, attr.attname AS column_name
    FROM pg_constraint fk
    JOIN LATERAL unnest(fk.conkey, fk.confkey) AS key_column(source_key, target_key) ON true
    JOIN pg_class relation ON relation.oid = fk.conrelid
    JOIN pg_namespace ns ON ns.oid = relation.relnamespace
    JOIN pg_attribute attr ON attr.attrelid = fk.conrelid AND attr.attnum = key_column.source_key
    JOIN pg_attribute target_attr ON target_attr.attrelid = fk.confrelid AND target_attr.attnum = key_column.target_key
    WHERE fk.contype = 'f' AND fk.confrelid = ${`public.${table}`}::regclass
      AND target_attr.attname = 'id'
  `);
  for (const reference of references.rows) {
    if (skipSections && reference.schema_name === 'public' && reference.table_name === 'sections' && reference.column_name === 'class_id') continue;
    const linked = await tx.execute(sql`SELECT 1 FROM ${identifier(reference.schema_name)}.${identifier(reference.table_name)}
      WHERE ${identifier(reference.column_name)} IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)}) LIMIT 1`);
    if (linked.rows.length) throw new AcademicDeleteError('This item is in use. Move or remove its linked records before deleting it.', 409);
  }
}

export async function deleteAcademicInTransaction(tx: Transaction, institutionId: number, kind: AcademicKind, id: number) {
  const table = tables[kind];
  const found = await tx.execute<{ id: number; name: string; is_graduated_archive?: boolean }>(sql`
    SELECT * FROM public.${identifier(table)} WHERE id = ${id} AND institution_id = ${institutionId} FOR UPDATE
  `);
  const record = found.rows[0];
  if (!record) throw new AcademicDeleteError('Academic item not found.', 404);
  if (kind === 'class' && record.is_graduated_archive) throw new AcademicDeleteError('The graduated-student archive cannot be deleted.', 409);
  if (kind === 'section' && record.name === 'Whole Class') throw new AcademicDeleteError('The default section belongs to its class. Delete the unused class instead.', 409);
  await assertUnused(tx, table, [id], kind === 'class');
  if (kind === 'class') {
    const children = await tx.execute<{ id: number; institution_id: number }>(sql`
      SELECT id, institution_id FROM public.sections WHERE class_id = ${id} ORDER BY id FOR UPDATE
    `);
    if (children.rows.some(row => row.institution_id !== institutionId)) throw new AcademicDeleteError('This class has inconsistent section ownership and cannot be deleted.', 409);
    await assertUnused(tx, 'sections', children.rows.map(row => row.id));
    await tx.execute(sql`DELETE FROM public.sections WHERE class_id = ${id} AND institution_id = ${institutionId}`);
  }
  await tx.execute(sql`DELETE FROM public.${identifier(table)} WHERE id = ${id} AND institution_id = ${institutionId}`);
}

export async function deleteInstitutionAcademic(institutionId: number, kind: AcademicKind, id: number) {
  await db.transaction(tx => deleteAcademicInTransaction(tx, institutionId, kind, id));
}
