import { NextResponse, type NextRequest } from 'next/server';
import { createHash } from 'node:crypto';
import { RestoreError, readRestoreZip } from './institution-restore-format';
import { MAX_RESTORE_UPLOAD_BYTES } from './institution-restore-limits';
export { MAX_RESTORE_UPLOAD_BYTES } from './institution-restore-limits';
import { submitInstitutionRestore, type RestoreActor } from './institution-restores';

export function restoreErrorResponse(error: unknown) {
  if (error instanceof RestoreError) return NextResponse.json({ error: error.message }, { status: error.status });
  return NextResponse.json({ error: 'Restore service is unavailable. Check migrations and the background worker.' }, { status: 503 });
}
export function restoreRequestId(value: unknown) {
  const id = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(id) || id <= 0) throw new RestoreError('Invalid restore request identifier.');
  return id;
}
export async function acceptRestoreUpload(req: NextRequest, institutionId: number, actor: RestoreActor) {
  if (!req.headers.get('content-type')?.startsWith('multipart/form-data;')) throw new RestoreError('Upload a ZIP and its password.');
  const reader = req.body?.getReader();
  if (!reader) throw new RestoreError('Upload is empty.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESTORE_UPLOAD_BYTES) { await reader.cancel(); throw new RestoreError('Upload exceeds 16 MB.', 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  let form: FormData;
  try {
    form = await new Response(Buffer.concat(chunks), { headers: { 'Content-Type': req.headers.get('content-type')! } }).formData();
  } catch { throw new RestoreError('Invalid multipart upload.'); }
  const file = form.get('file');
  const password = form.get('password');
  if (!(file instanceof File) || typeof password !== 'string') throw new RestoreError('A ZIP file and archive password are required.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const payload = await readRestoreZip(bytes, password, institutionId);
  const id = await submitInstitutionRestore(payload, createHash('sha256').update(bytes).digest('hex'), actor);
  return NextResponse.json({ id, message: 'Restore request submitted. A preview will be prepared by the background worker.' }, { status: 202 });
}
