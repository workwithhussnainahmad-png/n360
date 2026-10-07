import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { centralBackupSettings } from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { encryptStreamingCredentials } from "@/lib/streaming-credentials";

export const GET = requireRole(["SUPER_ADMIN"], async () => {
  const [settings] = await db.select({ configured: centralBackupSettings.databasePasswordEncrypted }).from(centralBackupSettings).where(eq(centralBackupSettings.id, 1)).limit(1);
  return NextResponse.json({ configured: Boolean(settings?.configured) });
}, { permission: 'platform.security' });

export const PUT = requireRole(["SUPER_ADMIN"], async (req: NextRequest, { session }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const password = body && typeof body === "object" && typeof (body as { password?: unknown }).password === "string"
    ? (body as { password: string }).password : "";
  if (password.length < 14 || password.length > 200) return NextResponse.json({ error: "Password must contain 14-200 characters" }, { status: 400 });
  const encrypted = encryptStreamingCredentials({ password });
  const actor = { updatedBy: session.role === "SUPER_ADMIN" ? Number(session.userId) : null, updatedByEmployee: session.role === "EMPLOYEE" ? Number(session.userId) : null };
  await db.insert(centralBackupSettings).values({ id: 1, databasePasswordEncrypted: encrypted, ...actor, updatedAt: new Date() }).onConflictDoUpdate({ target: centralBackupSettings.id, set: { databasePasswordEncrypted: encrypted, ...actor, updatedAt: new Date() } });
  return NextResponse.json({ configured: true });
}, { permission: 'platform.security' });
