import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { institutions, staff } from "@/db/schema";
import { encryptStreamingCredentials, hasStreamingCredentials } from "@/lib/streaming-credentials";
import { getTenantContext, requireRole } from "@/lib/rbac";
import { invalidateInstitutionCourseStreamingHint } from "@/lib/course-streaming";

const schema = z.discriminatedUnion("provider", [
  z.object({ provider: z.literal("BUNNY"), libraryId: z.string().trim().min(1).max(100), apiKey: z.string().trim().min(8).max(500), cdnHostname: z.string().trim().min(3).max(255), tokenAuthKey: z.string().trim().min(8).max(500) }).strict(),
  z.object({ provider: z.literal("MUX"), tokenId: z.string().trim().min(1).max(200), tokenSecret: z.string().trim().min(8).max(500) }).strict(),
]);

function muxAuthorization(tokenId: string, tokenSecret: string) {
  return `Basic ${Buffer.from(`${tokenId}:${tokenSecret}`).toString("base64")}`;
}

async function prepareMuxCredentials(tokenId: string, tokenSecret: string) {
  const authorization = muxAuthorization(tokenId, tokenSecret);
  const verify = await fetch("https://api.mux.com/video/v1/assets?limit=1", {
    headers: { Authorization: authorization, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!verify.ok) {
    throw new Error(
      verify.status === 401 || verify.status === 403
        ? "Mux rejected this Access Token. Use a Video API token with Video Read/Write and System Write permissions."
        : "Mux could not verify the Access Token right now.",
    );
  }
  const signing = await fetch("https://api.mux.com/system/v1/signing-keys", {
    method: "POST",
    headers: { Authorization: authorization, Accept: "application/json", "Content-Type": "application/json" },
    body: "{}",
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const signingPayload = await signing.json().catch(() => null) as { data?: { id?: string; private_key?: string } } | null;
  if (!signing.ok || !signingPayload?.data?.id || !signingPayload.data.private_key) {
    throw new Error("Mux needs System Write permission to create the signing key used for protected student playback.");
  }
  return { tokenId, tokenSecret, signingKeyId: signingPayload.data.id, signingPrivateKey: signingPayload.data.private_key };
}

async function verifyBunnyCredentials(libraryId: string, apiKey: string) {
  const response = await fetch(`https://video.bunnycdn.com/library/${encodeURIComponent(libraryId)}/videos?page=1&itemsPerPage=1`, {
    headers: { AccessKey: apiKey, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("Bunny Stream rejected this Library ID or API key.");
}

export const GET = requireRole(["INSTITUTION", "INSTITUTION_ADMIN", "STAFF"], async (_req, { session }) => {
  const institutionId = getTenantContext(session);
  if (session.role === "STAFF") {
    const [[teacher], [institution]] = await Promise.all([
      db.select({ provider: staff.courseStreamingProvider, credentials: staff.courseStreamingCredentials }).from(staff).where(and(eq(staff.id, session.userId), eq(staff.institutionId, institutionId))).limit(1),
      db.select({ provider: institutions.courseStreamingProvider, credentials: institutions.courseStreamingCredentials }).from(institutions).where(eq(institutions.id, institutionId)).limit(1),
    ]);
    return NextResponse.json({ scope: "STAFF", provider: teacher?.provider || null, configured: hasStreamingCredentials(teacher?.credentials), institutionOverride: institution?.provider ? { provider: institution.provider, configured: hasStreamingCredentials(institution.credentials) } : null });
  }
  const [institution] = await db.select({ provider: institutions.courseStreamingProvider, credentials: institutions.courseStreamingCredentials }).from(institutions).where(eq(institutions.id, institutionId)).limit(1);
  return NextResponse.json({ scope: "INSTITUTION", provider: institution?.provider || null, configured: hasStreamingCredentials(institution?.credentials) });
});

export const PUT = requireRole(["INSTITUTION", "STAFF"], async (req: NextRequest, { session }) => {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid streaming settings" }, { status: 400 });
  const institutionId = getTenantContext(session);
  let credentials: Record<string, string>;
  try {
    if (parsed.data.provider === "BUNNY") {
      await verifyBunnyCredentials(parsed.data.libraryId, parsed.data.apiKey);
      const cdnHostname = parsed.data.cdnHostname.replace(/^https?:\/\//, "").replace(/\/+$/, "");
      credentials = { libraryId: parsed.data.libraryId, apiKey: parsed.data.apiKey, cdnHostname, tokenAuthKey: parsed.data.tokenAuthKey };
    } else {
      credentials = await prepareMuxCredentials(parsed.data.tokenId, parsed.data.tokenSecret);
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not verify streaming credentials" }, { status: 400 });
  }
  const encrypted = encryptStreamingCredentials(credentials);
  if (session.role === "STAFF") await db.update(staff).set({ courseStreamingProvider: parsed.data.provider, courseStreamingCredentials: encrypted }).where(and(eq(staff.id, session.userId), eq(staff.institutionId, institutionId)));
  else {
    await db.update(institutions).set({ courseStreamingProvider: parsed.data.provider, courseStreamingCredentials: encrypted }).where(eq(institutions.id, institutionId));
    await invalidateInstitutionCourseStreamingHint(institutionId);
  }
  return NextResponse.json({ success: true, provider: parsed.data.provider, configured: true });
});

export const DELETE = requireRole(["INSTITUTION", "STAFF"], async (_req, { session }) => {
  const institutionId = getTenantContext(session);
  if (session.role === "STAFF") {
    await db
      .update(staff)
      .set({ courseStreamingProvider: null, courseStreamingCredentials: null })
      .where(
        and(
          eq(staff.id, session.userId),
          eq(staff.institutionId, institutionId),
        ),
      );
  } else {
    await db
      .update(institutions)
      .set({ courseStreamingProvider: null, courseStreamingCredentials: null })
      .where(eq(institutions.id, institutionId));
    await invalidateInstitutionCourseStreamingHint(institutionId);
  }
  return NextResponse.json({ success: true, configured: false });
});
