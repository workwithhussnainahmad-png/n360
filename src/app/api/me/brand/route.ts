import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { institutions } from "@/db/schema";
import { getLightSessionFromRequest } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { getCachedOrFetch } from "@/lib/redis";

function dashboardHref(role: string) {
  if (role === "SUPER_ADMIN") return "/sa/dashboard";
  if (role === "EMPLOYEE") return "/employee/dashboard";
  if (role === "INSTITUTION" || role === "INSTITUTION_ADMIN") return "/institution/dashboard";
  if (role === "STAFF") return "/staff/dashboard";
  if (role === "STUDENT") return "/student/dashboard";
  return "/";
}

/**
 * Institution branding for shell chrome (visible on every authenticated page).
 *
 * Cache key: cache:brand:{institutionId}
 * Scope: institution (shared across roles in tenant)
 * TTL: 300s (+ jitter via getCachedOrFetch)
 * Invalidation: logo/name mutations should delete cache:brand:{id}
 * Acceptable staleness: ~5 minutes for name/logo
 * Fallback: Valkey miss → Postgres; light JWT session (no validity round-trip)
 */
export async function GET(req: NextRequest) {
  const session = await getLightSessionFromRequest(req);

  if (!session) {
    return NextResponse.json({
      name: "Nisaab360",
      logoKey: null,
      href: "/",
      isInstitutionBrand: false,
    });
  }

  const institutionId = session.role === "INSTITUTION" ? session.userId : session.institutionId;
  if (!institutionId) {
    return NextResponse.json({
      name: "Nisaab360",
      logoKey: null,
      href: dashboardHref(session.role),
      isInstitutionBrand: false,
      role: session.role,
      userId: session.userId,
      institutionId: null,
    });
  }

  const brand = await getCachedOrFetch(`cache:brand:${institutionId}`, 300, async () => {
    const [institution] = await db
      .select({
        name: institutions.name,
        logoKey: institutions.logoKey,
      })
      .from(institutions)
      .where(eq(institutions.id, institutionId))
      .limit(1);

    return {
      name: institution?.name || "Nisaab360",
      logoKey: institution?.logoKey || null,
      isInstitutionBrand: Boolean(institution),
    };
  });

  return NextResponse.json({
    name: brand.name,
    logoKey: brand.logoKey,
    href: dashboardHref(session.role),
    isInstitutionBrand: brand.isInstitutionBrand,
    role: session.role,
    userId: session.userId,
    institutionId,
  });
}
