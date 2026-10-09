import { inputErrorResponse } from '@/lib/input-error-response';
import { NextRequest, NextResponse } from "next/server";
import { and, count, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { institutionAdmins } from "@/db/schema";
import { hashPassword as hash } from "@/lib/argon2-pool";
import { getTenantContext, requireRole } from "@/lib/rbac";
import { assertCampusEmailAvailable } from "@/lib/campus-workspaces";

const MAX_ADMINS = 2;

export const GET = requireRole(["INSTITUTION", "INSTITUTION_ADMIN"], async (_req: NextRequest, { session }) => {
  const institutionId = getTenantContext(session);
  const admins = await db
    .select({
      id: institutionAdmins.id,
      name: institutionAdmins.name,
      email: institutionAdmins.email,
      createdAt: institutionAdmins.createdAt,
    })
    .from(institutionAdmins)
    .where(eq(institutionAdmins.institutionId, institutionId));

  return NextResponse.json({ admins, maxAdmins: MAX_ADMINS });
});

export const POST = requireRole(["INSTITUTION"], async (req: NextRequest, { session }) => {
  try {
    const institutionId = getTenantContext(session);
    const body = await req.json();
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");

    if (!name || !email || !password) {
      return NextResponse.json({ error: "Name, email, and password are required" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    const passwordHash = await hash(password);
    const inserted = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM institutions WHERE id = ${institutionId} FOR UPDATE`);
      await assertCampusEmailAvailable(tx, email);
      const [existing] = await tx.select({ value: count() }).from(institutionAdmins).where(eq(institutionAdmins.institutionId, institutionId));
      if ((existing?.value || 0) >= MAX_ADMINS) throw new Error(`You can only create a maximum of ${MAX_ADMINS} admins`);
      const [created] = await tx.insert(institutionAdmins)
      .values({ institutionId, name, email, passwordHash })
      .returning({ id: institutionAdmins.id });
      return created;
    });

    return NextResponse.json({ success: true, id: inserted.id });
  } catch (error: any) {
    const publicInputError = inputErrorResponse(error);
    if (publicInputError) return NextResponse.json(publicInputError.body, { status: publicInputError.status });

    if (error instanceof Error && /already in use|maximum of/.test(error.message)) return NextResponse.json({ error: error.message }, { status: 409 });
    if (typeof error === "object" && error && "code" in error && error.code === "23505") {
      return NextResponse.json({ error: "An admin with this email already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message || "Failed to create admin" }, { status: 500 });
  }
} , { permission: 'institution.security' });

export const DELETE = requireRole(["INSTITUTION"], async (req: NextRequest, { session }) => {
  const institutionId = getTenantContext(session);
  const idParam = req.nextUrl.searchParams.get("id");
  const adminId = Number(idParam);
  if (!Number.isInteger(adminId)) {
    return NextResponse.json({ error: "Valid admin id is required" }, { status: 400 });
  }

  await db
    .delete(institutionAdmins)
    .where(and(eq(institutionAdmins.id, adminId), eq(institutionAdmins.institutionId, institutionId)));

  return NextResponse.json({ success: true });
} , { permission: 'institution.security' });
