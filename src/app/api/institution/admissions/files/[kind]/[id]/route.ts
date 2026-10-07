import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { admissionDocumentRequests, admissionFeePayments } from '@/db/schema';
import { decodeAdmissionFileAsset, hasExactFolderPrefix } from '@/lib/admission-files';
import cloudinary from '@/lib/cloudinary';
import { getTenantContext, requireRole } from '@/lib/rbac';
import type { JWTPayload } from '@/lib/auth';

export const GET = requireRole(['INSTITUTION', 'INSTITUTION_ADMIN'], async (
  _req: NextRequest,
  { session, params }: { session: JWTPayload; params: Promise<{ kind: string; id: string }> },
) => {
  const { kind, id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0 || !['document', 'fee'].includes(kind)) {
    return NextResponse.json({ error: 'Invalid admissions file' }, { status: 400 });
  }

  const institutionId = getTenantContext(session);
  const [record] = kind === 'document'
    ? await db.select({ applicationId: admissionDocumentRequests.applicationId, fileKey: admissionDocumentRequests.submittedFileKey })
      .from(admissionDocumentRequests)
      .where(and(eq(admissionDocumentRequests.id, id), eq(admissionDocumentRequests.institutionId, institutionId)))
      .limit(1)
    : await db.select({ applicationId: admissionFeePayments.applicationId, fileKey: admissionFeePayments.proofFileKey })
      .from(admissionFeePayments)
      .where(and(eq(admissionFeePayments.id, id), eq(admissionFeePayments.institutionId, institutionId)))
      .limit(1);

  if (!record?.fileKey) return NextResponse.json({ error: 'Admissions file not found' }, { status: 404 });

  // Files uploaded before authenticated delivery was introduced were stored as
  // direct Cloudinary URLs. Keep them available only after the same tenant check.
  if (record.fileKey.startsWith('https://')) {
    try {
      const legacyUrl = new URL(record.fileKey);
      const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME;
      if (legacyUrl.hostname !== 'res.cloudinary.com' || !cloudName || !legacyUrl.pathname.startsWith(`/${cloudName}/`)) throw new Error('Invalid legacy URL');
      const response = NextResponse.redirect(legacyUrl, 302);
      response.headers.set('Cache-Control', 'private, no-store');
      return response;
    } catch {
      return NextResponse.json({ error: 'Admissions file is invalid' }, { status: 410 });
    }
  }

  const asset = decodeAdmissionFileAsset(record.fileKey);
  const expectedFolder = kind === 'document'
    ? `admission-documents/${institutionId}/${record.applicationId}/${id}`
    : `admission-fees/${institutionId}/${record.applicationId}`;
  if (!asset || !hasExactFolderPrefix(asset.publicId, expectedFolder)) {
    return NextResponse.json({ error: 'Admissions file is invalid' }, { status: 410 });
  }

  const downloadUrl = cloudinary.utils.private_download_url(asset.publicId, asset.format, {
    resource_type: asset.resourceType,
    type: 'authenticated',
    expires_at: Math.floor(Date.now() / 1000) + 5 * 60,
    attachment: false,
  });
  const response = NextResponse.redirect(downloadUrl, 302);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
});
