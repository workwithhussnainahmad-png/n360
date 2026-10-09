import { inputErrorResponse } from '@/lib/input-error-response';
import { validationError } from '@/lib/validation-errors';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { institutions, campuses } from '@/db/schema';
import { assertCampusEmailAvailable } from '@/lib/campus-workspaces';
import { hash } from '@node-rs/argon2';
import { registerInstitutionSchema } from '@/lib/validators/institution';
import { withRateLimit } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  try {
    const rateLimit = await withRateLimit(req, 'api');
    if (!rateLimit.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const body = await req.json();
    const parsed = registerInstitutionSchema.safeParse(body);
    
    if (!parsed.success) {
      return NextResponse.json(validationError(parsed.error), { status: 400 });
    }

    const data = parsed.data;
    const adminPasswordHash = await hash(data.adminPassword);

    await db.transaction(async (tx) => {
    await assertCampusEmailAvailable(tx, data.contactEmail);
    const [institution] = await tx.insert(institutions).values({
      name: data.name,
      campusName: data.mainCampusName,
      type: data.type,
      username: data.username,
      country: data.country,
      city: data.city,
      address: data.address,
      contactEmail: data.contactEmail,
      contactPhone: data.contactPhone,
      registrationNumber: data.registrationNumber,
      pricingPlan: data.pricingPlan,
      logoKey: data.logoKey,
      proofDocumentKey: data.proofDocumentKey,
      adminPasswordHash,
      status: 'PENDING',
    }).returning({ id: institutions.id });
    await tx.insert(campuses).values({ institutionId: institution.id, name: data.mainCampusName, address: data.address });
    });

    return NextResponse.json({ message: 'Institution registered successfully. Pending approval.' }, { status: 201 });
  } catch (err: unknown) {
    const publicInputError = inputErrorResponse(err);
    if (publicInputError) return NextResponse.json(publicInputError.body, { status: publicInputError.status });

    if (err instanceof Error && err.message === 'This login email is already in use.') {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    const errorCode =
      err && typeof err === 'object' && 'code' in err
        ? (err as { code?: unknown }).code
        : undefined;
    if (errorCode === '23505') { // Postgres unique constraint violation
      return NextResponse.json({ error: 'Username or email already exists' }, { status: 409 });
    }
    console.error('Registration Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
