import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { gradingScales } from '@/db/schema';
import { getTenantContext, requireRole } from '@/lib/rbac';

type Grade = { letter: string; min: number; max: number };

function parseScale(body: unknown): { passingPercentage: number; gradesJson: Grade[] } | null {
  const value = body as { passingPercentage?: unknown; gradesJson?: unknown };
  const passingPercentage = Number(value?.passingPercentage);
  if (!Number.isFinite(passingPercentage) || passingPercentage < 0 || passingPercentage > 100 || !Array.isArray(value?.gradesJson)) return null;
  const gradesJson = value.gradesJson.map((grade): Grade | null => {
    const item = grade as { letter?: unknown; min?: unknown; max?: unknown };
    const letter = typeof item.letter === 'string' ? item.letter.trim() : '';
    const min = Number(item.min);
    const max = Number(item.max);
    return letter && letter.length <= 10 && Number.isFinite(min) && Number.isFinite(max) && min >= 0 && max <= 100 && min <= max
      ? { letter, min, max }
      : null;
  });
  return gradesJson.length > 0 && gradesJson.every(Boolean) ? { passingPercentage, gradesJson: gradesJson as Grade[] } : null;
}

export const GET = requireRole(['INSTITUTION', 'INSTITUTION_ADMIN'], async (_req, { session }) => {
  const [scale] = await db.select().from(gradingScales).where(eq(gradingScales.institutionId, getTenantContext(session))).limit(1);
  return NextResponse.json({ scale: scale || null });
});

async function save(req: NextRequest, session: Parameters<typeof getTenantContext>[0]) {
  const scale = parseScale(await req.json());
  if (!scale) return NextResponse.json({ error: 'Provide a passing percentage and at least one valid grade range.' }, { status: 400 });
  const institutionId = getTenantContext(session);
  const [saved] = await db.insert(gradingScales).values({ institutionId, ...scale }).onConflictDoUpdate({
    target: gradingScales.institutionId,
    set: { ...scale },
  }).returning();
  return NextResponse.json({ scale: saved });
}

export const POST = requireRole(['INSTITUTION', 'INSTITUTION_ADMIN'], async (req, { session }) => save(req, session));
export const PUT = requireRole(['INSTITUTION', 'INSTITUTION_ADMIN'], async (req, { session }) => save(req, session));
