import { db } from "@/db";
import { institutions } from "@/db/schema";
import type { JWTPayload } from "@/lib/auth-types";
import { getCachedOrFetch } from "@/lib/redis";
import type { ShellBrand } from "@/components/layout/BrandMark";
import { eq } from "drizzle-orm";

function dashboardHref(role: string) {
  if (role === "SUPER_ADMIN") return "/sa/dashboard";
  if (role === "EMPLOYEE") return "/employee/dashboard";
  if (role === "INSTITUTION" || role === "INSTITUTION_ADMIN") return "/institution/dashboard";
  if (role === "STAFF") return "/staff/dashboard";
  if (role === "STUDENT") return "/student/dashboard";
  return "/";
}

/**
 * Resolve shell branding for RSC layouts (safe metadata only).
 *
 * Cache key: cache:brand:{institutionId}
 * Scope: institution
 * TTL: 300s
 * Invalidation: logo PATCH deletes the key
 * Fallback: Valkey miss → Postgres; non-tenant roles get default brand
 */
export async function getShellBrandForSession(session: JWTPayload): Promise<ShellBrand> {
  const href = dashboardHref(session.role);
  const institutionId = session.institutionId ?? (session.role === "INSTITUTION" ? session.userId : undefined);

  if (!institutionId) {
    return {
      name: "Nisaab360",
      logoKey: null,
      href,
      isInstitutionBrand: false,
    };
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

  return {
    name: brand.name,
    logoKey: brand.logoKey,
    href,
    isInstitutionBrand: brand.isInstitutionBrand,
  };
}
