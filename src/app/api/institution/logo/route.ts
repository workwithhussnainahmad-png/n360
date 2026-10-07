import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { institutions } from "@/db/schema";
import { getTenantContext, requireRole } from "@/lib/rbac";
import { eq } from "drizzle-orm";
import cloudinary from "@/lib/cloudinary";
import { ownsUploadPublicId } from "@/lib/upload-ownership";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const ALLOWED_LOGO_FORMATS = new Set(["jpg", "jpeg", "png", "webp"]);

export const PATCH = requireRole(["INSTITUTION", "INSTITUTION_ADMIN"], async (req: NextRequest, { session }) => {
  const body = await req.json();
  const publicId = typeof body.publicId === "string" ? body.publicId.trim() : "";

  if (!publicId || !ownsUploadPublicId(session, publicId)) {
    return NextResponse.json({ error: "Uploaded logo is required" }, { status: 400 });
  }

  const resource = await cloudinary.api.resource(publicId, { resource_type: "image" });
  const format = String(resource.format || "").toLowerCase();
  const bytes = Number(resource.bytes || 0);
  if (bytes <= 0 || bytes > MAX_LOGO_BYTES || !ALLOWED_LOGO_FORMATS.has(format)) {
    return NextResponse.json({ error: "Logo must be JPG, PNG, or WEBP up to 2MB" }, { status: 400 });
  }

  await db.update(institutions)
    .set({ logoKey: resource.secure_url })
    .where(eq(institutions.id, getTenantContext(session)));

  try {
    const { redis } = await import("@/lib/redis");
    if (redis.status === "ready") {
      await redis.del(`cache:brand:${getTenantContext(session)}`);
    }
  } catch {
    // Brand cache miss is acceptable until TTL
  }

  return NextResponse.json({ message: "Institution logo updated" });
});
