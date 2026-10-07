import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { feePaymentSubmissions } from '@/db/schema';
import { decodeAdmissionFileAsset, hasExactFolderPrefix } from '@/lib/admission-files';
import cloudinary from '@/lib/cloudinary';
import { getTenantContext, requireRole } from '@/lib/rbac';
import type { JWTPayload } from '@/lib/auth';

export const GET = requireRole(['INSTITUTION', 'INSTITUTION_ADMIN'], async (
  _req: NextRequest,
  { session, params }: { session: JWTPayload; params: Promise<{ id: string }> },
) => {
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Invalid payment proof' }, { status: 400 });
  const institutionId = getTenantContext(session);
  const [record] = await db.select({ studentId: feePaymentSubmissions.studentId, invoiceId: feePaymentSubmissions.invoiceId, fileKey: feePaymentSubmissions.proofFileKey }).from(feePaymentSubmissions).where(and(eq(feePaymentSubmissions.id, id), eq(feePaymentSubmissions.institutionId, institutionId))).limit(1);
  if (!record) return NextResponse.json({ error: 'Payment proof not found' }, { status: 404 });
  const asset = decodeAdmissionFileAsset(record.fileKey);
  const expectedFolder = `student-fees/${institutionId}/${record.studentId}/${record.invoiceId}`;
  if (!asset || !hasExactFolderPrefix(asset.publicId, expectedFolder)) return NextResponse.json({ error: 'Payment proof is invalid' }, { status: 410 });
  const url = cloudinary.utils.private_download_url(asset.publicId, asset.format, { resource_type: asset.resourceType, type: 'authenticated', expires_at: Math.floor(Date.now() / 1000) + 5 * 60, attachment: false });
  const response = NextResponse.redirect(url, 302);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
});
