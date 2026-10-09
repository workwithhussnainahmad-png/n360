import { inputErrorResponse } from '@/lib/input-error-response';
import { NextResponse } from 'next/server';
import cloudinary from '@/lib/cloudinary';
import { requireRole } from '@/lib/rbac';
import { withRateLimit } from '@/lib/rate-limit';
import { bodyTooLargeResponse, readJsonBody } from '@/lib/http';
import { ownedUploadFolder } from '@/lib/upload-ownership';

/**
 * The signed `folder` was previously whatever the caller asked for. A signature is
 * a capability: signing an arbitrary folder let any authenticated student mint
 * upload credentials into any namespace (mixing user content into the folders used
 * for institution logos, signatures and proofs), and the route had no rate limit at
 * all, so it doubled as an unmetered way to burn the Cloudinary quota.
 *
 * The server now assigns every account a tenant/role/user namespace. Clients receive
 * that signed folder in the response and cannot request a different destination.
 */
const ALLOWED_FORMATS = 'jpg,jpeg,png,webp,pdf,docx,txt';

/** The endpoint accepts no client-selected upload parameters. */
const MAX_SIGNATURE_BODY_BYTES = 1024;

export const POST = requireRole(['STUDENT', 'STAFF', 'INSTITUTION', 'INSTITUTION_ADMIN', 'SUPER_ADMIN'], async (req, { session }) => {
  try {
    // Keyed per account rather than per IP so a whole school behind one NAT
    // address is not throttled as a single client.
    const limited = await withRateLimit(req, 'upload', `${session.role}:${session.userId}`);
    if (!limited.success) {
      return NextResponse.json({ error: 'Too many upload requests. Please try again in a moment.' }, { status: 429 });
    }

    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (!cloudName || !apiKey || !apiSecret) {
      return NextResponse.json(
        { error: 'Cloudinary is not configured on the server' },
        { status: 500 }
      );
    }

    // Most callers POST with no body at all, which is treated as "use the default".
    const body = await readJsonBody<{ folder?: unknown }>(req, MAX_SIGNATURE_BODY_BYTES);
    if (!body.ok && body.status === 413) return bodyTooLargeResponse();

    if (body.ok && body.data?.folder !== undefined) {
      return NextResponse.json({ error: 'Upload folders are assigned by the server' }, { status: 400 });
    }
    const folder = ownedUploadFolder(session);

    const timestamp = Math.round(Date.now() / 1000);

    // Cloudinary signature generation
    const signature = cloudinary.utils.api_sign_request(
      {
        timestamp: timestamp,
        folder: folder,
        allowed_formats: ALLOWED_FORMATS,
      },
      apiSecret
    );

    return NextResponse.json(
      {
        signature,
        timestamp,
        cloudName,
        apiKey,
        folder,
        allowedFormats: ALLOWED_FORMATS,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    const publicInputError = inputErrorResponse(err);
    if (publicInputError) return NextResponse.json(publicInputError.body, { status: publicInputError.status });

    console.error('Cloudinary Signature Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
});
