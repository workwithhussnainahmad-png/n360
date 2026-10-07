import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { institutionHolidays } from "@/db/schema";
import { getTenantContext, requireRole } from "@/lib/rbac";
import type { JWTPayload } from "@/lib/auth";
import { and, eq } from "drizzle-orm";

function isDateString(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export const GET = requireRole(["INSTITUTION", "INSTITUTION_ADMIN"], async (_req: NextRequest, { session }: { session: JWTPayload }) => {
  const rows = await db.select()
    .from(institutionHolidays)
    .where(eq(institutionHolidays.institutionId, getTenantContext(session)));
  return NextResponse.json({ holidays: rows });
});

export const POST = requireRole(["INSTITUTION", "INSTITUTION_ADMIN"], async (req: NextRequest, { session }: { session: JWTPayload }) => {
  const body = await req.json();
  if (!isDateString(body.date)) return NextResponse.json({ error: "Holiday date is required" }, { status: 400 });

  const [holiday] = await db.insert(institutionHolidays).values({
    institutionId: getTenantContext(session),
    date: body.date,
    name: typeof body.name === "string" ? body.name.trim() || null : null,
  }).onConflictDoUpdate({
    target: [institutionHolidays.institutionId, institutionHolidays.date],
    set: { name: typeof body.name === "string" ? body.name.trim() || null : null },
  }).returning();

  return NextResponse.json({ holiday });
});

export const DELETE = requireRole(["INSTITUTION", "INSTITUTION_ADMIN"], async (req: NextRequest, { session }: { session: JWTPayload }) => {
  const body = await req.json();
  if (!isDateString(body.date)) return NextResponse.json({ error: "Holiday date is required" }, { status: 400 });

  await db.delete(institutionHolidays)
    .where(and(eq(institutionHolidays.institutionId, getTenantContext(session)), eq(institutionHolidays.date, body.date)));
  return NextResponse.json({ ok: true });
});
