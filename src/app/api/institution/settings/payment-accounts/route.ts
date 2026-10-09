import { validationError } from '@/lib/validation-errors';
import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { institutions } from '@/db/schema';
import { getTenantContext, requireRole } from '@/lib/rbac';
import { getPaymentAccounts } from '@/lib/manual-payment-accounts';
import cloudinary from '@/lib/cloudinary';
import { hasExactFolderPrefix, parseAdmissionUploadCompletion } from '@/lib/admission-files';
import { withRateLimit } from '@/lib/rate-limit';

const accountSchema = z.object({ providerName: z.string().trim().min(2).max(120), accountTitle: z.string().trim().min(2).max(160), accountNumber: z.string().trim().min(2).max(160) });
export const GET = requireRole(['INSTITUTION', 'INSTITUTION_ADMIN'], async (_req, { session }) =>
  NextResponse.json({ accounts: await getPaymentAccounts(getTenantContext(session)) }, { headers: { 'Cache-Control': 'no-store' } }));

export const POST = requireRole(['INSTITUTION'], async (req, { session }) => {
  const institutionId = getTenantContext(session);
  const limited = await withRateLimit(req, 'upload', `payment-accounts:${institutionId}`);
  if (!limited.success) return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Invalid payment account.' }, { status: 400 });
  if (body.action === 'qrSignature') {
    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY, secret = process.env.CLOUDINARY_API_SECRET;
    if (!cloudName || !apiKey || !secret) return NextResponse.json({ error: 'Image uploads are not configured.' }, { status: 503 });
    const folder = `payment-account-qr/${institutionId}`, timestamp = Math.floor(Date.now() / 1000), allowedFormats = 'jpg,jpeg,png,webp';
    return NextResponse.json({ cloudName, apiKey, folder, timestamp, allowedFormats,
      signature: cloudinary.utils.api_sign_request({ folder, timestamp, allowed_formats: allowedFormats }, secret) }, { headers: { 'Cache-Control': 'no-store' } });
  }
  const parsed = accountSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json(validationError(parsed.error), { status: 400 });
  let qrUrl: string | null = null;
  if (body.publicId) {
    const asset = parseAdmissionUploadCompletion(body);
    if (!asset || asset.resourceType !== 'image' || asset.format === 'pdf' || !hasExactFolderPrefix(asset.publicId, `payment-account-qr/${institutionId}`)) return NextResponse.json({ error: 'Invalid QR image.' }, { status: 400 });
    try {
      const resource = await cloudinary.api.resource(asset.publicId, { resource_type: 'image', type: 'upload' });
      if (resource.type !== 'upload' || resource.format !== asset.format || !Number.isFinite(resource.bytes) || resource.bytes < 1 || resource.bytes > 5 * 1024 * 1024) throw new Error('Invalid image');
      qrUrl = cloudinary.url(asset.publicId, { secure: true, resource_type: 'image', format: asset.format });
    } catch { return NextResponse.json({ error: 'Could not verify the QR image.' }, { status: 400 }); }
  }
  const account = { ...parsed.data, id: crypto.randomUUID(), qrUrl };
  const saved = await db.transaction(async tx => {
    const [row] = await tx.select({ accounts: institutions.feePaymentMethods }).from(institutions).where(eq(institutions.id, institutionId)).for('update');
    if (!row || row.accounts.length >= 20) return false;
    await tx.update(institutions).set({ feePaymentMethods: [...row.accounts, account] }).where(eq(institutions.id, institutionId));
    return true;
  });
  return saved ? NextResponse.json({ account }, { status: 201 }) : NextResponse.json({ error: 'You can add up to 20 payment accounts.' }, { status: 409 });
});
export const DELETE = requireRole(['INSTITUTION'], async (req, { session }) => {
  const institutionId = getTenantContext(session), id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Select a payment account.' }, { status: 400 });
  const removed = await db.transaction(async tx => {
    const [row] = await tx.select({ accounts: institutions.feePaymentMethods }).from(institutions).where(eq(institutions.id, institutionId)).for('update');
    if (!row?.accounts.some(account => account.id === id)) return false;
    await tx.update(institutions).set({ feePaymentMethods: row.accounts.filter(account => account.id !== id) }).where(eq(institutions.id, institutionId));
    return true;
  });
  return removed ? NextResponse.json({ success: true }) : NextResponse.json({ error: 'Payment account not found.' }, { status: 404 });
});
