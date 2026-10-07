import { isMainCampusWebsite } from '@/lib/public-website-access';
import { NextRequest, NextResponse } from 'next/server';
import cloudinary from '@/lib/cloudinary';
import { getTenantContext, requireRole } from '@/lib/rbac';
import { hasExactFolderPrefix, parseAdmissionUploadCompletion } from '@/lib/admission-files';
import { withRateLimit } from '@/lib/rate-limit';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export const POST = requireRole(['INSTITUTION', 'INSTITUTION_ADMIN'], async (req: NextRequest, { session }) => {
  const institutionId = getTenantContext(session);
  if (!await isMainCampusWebsite(institutionId)) return NextResponse.json({ error: 'Public website settings are available only for the main campus' }, { status: 403 });
  const limited = await withRateLimit(req, 'upload', `public-site-image:${institutionId}`);
  if (!limited.success) return NextResponse.json({ error: 'Too many uploads. Please wait and try again.' }, { status: 429 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 }); }
  if (!body || typeof body !== 'object' || !('action' in body)) return NextResponse.json({ error: 'Invalid upload action' }, { status: 400 });

  const folder = `institution-public/${institutionId}`;
  if (body.action === 'signature') {
    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    if (!cloudName || !apiKey || !apiSecret) return NextResponse.json({ error: 'Image uploads are not configured' }, { status: 503 });
    const timestamp = Math.round(Date.now() / 1000);
    const allowedFormats = 'jpg,jpeg,png,webp';
    const type = 'upload';
    const signature = cloudinary.utils.api_sign_request({ timestamp, folder, allowed_formats: allowedFormats, type }, apiSecret);
    return NextResponse.json({ signature, timestamp, folder, allowedFormats, type, cloudName, apiKey }, { headers: { 'Cache-Control': 'no-store' } });
  }

  if (body.action !== 'complete') return NextResponse.json({ error: 'Invalid upload action' }, { status: 400 });
  const asset = parseAdmissionUploadCompletion(body);
  if (!asset || asset.resourceType !== 'image' || !hasExactFolderPrefix(asset.publicId, folder)) return NextResponse.json({ error: 'Uploaded image could not be verified' }, { status: 400 });
  try {
    const resource = await cloudinary.api.resource(asset.publicId, { resource_type: 'image', type: 'upload' });
    if (resource.type !== 'upload' || Number(resource.bytes) > MAX_IMAGE_BYTES || !['jpg', 'jpeg', 'png', 'webp'].includes(String(resource.format).toLowerCase())) {
      await cloudinary.uploader.destroy(asset.publicId, { resource_type: 'image', type: 'upload', invalidate: true }).catch(() => undefined);
      return NextResponse.json({ error: 'Uploaded image could not be verified' }, { status: 400 });
    }
    return NextResponse.json({ url: resource.secure_url }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Uploaded image could not be verified' }, { status: 400 });
  }
});
