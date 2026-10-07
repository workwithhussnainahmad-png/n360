import { NextRequest, NextResponse } from 'next/server';
import cloudinary from '@/lib/cloudinary';
import { requireRole } from '@/lib/rbac';
import { withRateLimit } from '@/lib/rate-limit';
import { ownsUploadPublicId } from '@/lib/upload-ownership';

const MAX_CONTENT_BYTES = 5 * 1024 * 1024;
const ALLOWED_FORMATS = new Set(['jpg', 'jpeg', 'png', 'webp', 'pdf', 'docx', 'txt']);

export const POST = requireRole(['STUDENT', 'STAFF', 'INSTITUTION', 'INSTITUTION_ADMIN', 'SUPER_ADMIN'], async (req: NextRequest, { session }) => {
  const limited = await withRateLimit(req, 'upload', `complete:${session.role}:${session.userId}`);
  if (!limited.success) return NextResponse.json({ error: 'Too many upload attempts. Please wait and try again.' }, { status: 429 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 }); }
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid upload completion' }, { status: 400 });
  const value = body as Record<string, unknown>;
  const publicId = typeof value.publicId === 'string' ? value.publicId.trim() : '';
  const resourceType = value.resourceType === 'raw' ? 'raw' : value.resourceType === 'image' ? 'image' : null;
  const imageOnly = value.imageOnly === true;
  if (!publicId || !resourceType || !ownsUploadPublicId(session, publicId)) {
    return NextResponse.json({ error: 'Uploaded file could not be verified' }, { status: 400 });
  }

  try {
    const resource = await cloudinary.api.resource(publicId, { resource_type: resourceType, type: 'upload' });
    const format = String(resource.format || '').toLowerCase();
    const bytes = Number(resource.bytes || 0);
    if (resource.type !== 'upload' || typeof resource.secure_url !== 'string' || bytes <= 0 || bytes > MAX_CONTENT_BYTES || !ALLOWED_FORMATS.has(format) || (imageOnly && !['jpg', 'jpeg', 'png', 'webp'].includes(format))) {
      await cloudinary.uploader.destroy(publicId, { resource_type: resourceType, type: 'upload', invalidate: true }).catch(() => undefined);
      return NextResponse.json({ error: 'File must be an allowed type and no larger than 5 MB' }, { status: 400 });
    }
    return NextResponse.json({ url: resource.secure_url, publicId, format, resourceType }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Uploaded file could not be verified' }, { status: 400 });
  }
});
