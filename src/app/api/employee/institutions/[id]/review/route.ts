import { NextRequest, NextResponse } from 'next/server';
import { changeInstitutionStatus } from "@/lib/institution-status";
import { db } from '@/db';
import { institutions } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireRole } from '@/lib/rbac';
import { reviewInstitutionSchema } from '@/lib/validators/institution';
import { sendEmail, InstitutionStatusEmail } from '@/lib/email';

export const POST = requireRole(['SUPER_ADMIN', 'EMPLOYEE'], async (req: NextRequest, { params, session }) => {
  const { id } = await params;
  const institutionId = parseInt(id, 10);
  if (isNaN(institutionId)) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
  }

  const body = await req.json();
  const parsed = reviewInstitutionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { status, rejectionReason } = parsed.data;

  const [inst] = await db.select().from(institutions).where(eq(institutions.id, institutionId)).limit(1);
  if (!inst) {
    return NextResponse.json({ error: 'Institution not found' }, { status: 404 });
  }

  try { await changeInstitutionStatus(session, institutionId, status, rejectionReason); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Review denied.' }, {status:403}); }

  await sendEmail({
    to: inst.contactEmail,
    subject: `Institution Registration ${status}`,
    html: InstitutionStatusEmail({ name: inst.name, status, reason: rejectionReason }),
  });

  return NextResponse.json({ message: `Institution ${status}` });
});
