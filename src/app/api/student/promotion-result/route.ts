import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { studentPromotions } from "@/db/schema";
import { requireRole, getTenantContext } from "@/lib/rbac";
import { and, desc, eq } from "drizzle-orm";

/** Latest promotion for the one-time dashboard dialog — not part of the main dashboard blob. */
export const GET = requireRole(["STUDENT"], async (_req: NextRequest, { session }) => {
  const institutionId = getTenantContext(session);

  const [promotion] = await db
    .select({ id: studentPromotions.id, status: studentPromotions.status })
    .from(studentPromotions)
    .where(
      and(
        eq(studentPromotions.studentId, session.userId),
        eq(studentPromotions.institutionId, institutionId)
      )
    )
    .orderBy(desc(studentPromotions.createdAt))
    .limit(1);

  return NextResponse.json({ promotion: promotion ?? null });
});
