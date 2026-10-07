import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { institutions, staff } from "@/db/schema";
import { decryptStreamingCredentials, hasStreamingCredentials } from "@/lib/streaming-credentials";
import { getCachedOrFetch, peekCachedOrFetch, redis } from "@/lib/redis";

export type CourseStreamingProvider = "BUNNY" | "MUX";

export type CourseStreamingSettings = {
  provider: CourseStreamingProvider;
  credentials: Record<string, string>;
  scope: "INSTITUTION" | "STAFF";
};

export async function getEffectiveCourseStreamingSettings(
  institutionId: number,
  staffId?: number | null,
): Promise<CourseStreamingSettings | null> {
  const [institution] = await db
    .select({
      provider: institutions.courseStreamingProvider,
      credentials: institutions.courseStreamingCredentials,
    })
    .from(institutions)
    .where(eq(institutions.id, institutionId))
    .limit(1);

  const institutionCredentials = decryptStreamingCredentials(institution?.credentials);
  if (institution?.provider && institutionCredentials) {
    return {
      provider: institution.provider,
      credentials: institutionCredentials,
      scope: "INSTITUTION",
    };
  }

  if (!staffId) return null;
  const [teacher] = await db
    .select({
      provider: staff.courseStreamingProvider,
      credentials: staff.courseStreamingCredentials,
    })
    .from(staff)
    .where(and(eq(staff.id, staffId), eq(staff.institutionId, institutionId)))
    .limit(1);
  const teacherCredentials = decryptStreamingCredentials(teacher?.credentials);
  return teacher?.provider && teacherCredentials
    ? { provider: teacher.provider, credentials: teacherCredentials, scope: "STAFF" }
    : null;
}

export async function isInstitutionCourseStreamingConfigured(
  institutionId: number,
) {
  const [institution] = await db
    .select({
      provider: institutions.courseStreamingProvider,
      credentials: institutions.courseStreamingCredentials,
    })
    .from(institutions)
    .where(eq(institutions.id, institutionId))
    .limit(1);

  return Boolean(
    institution?.provider && hasStreamingCredentials(institution.credentials),
  );
}

/** Cached navigation hint only; course authorization uses the fresh check above. */
export function getInstitutionCourseStreamingHint(institutionId: number) {
  return getCachedOrFetch(`cache:courses:enabled:${institutionId}`, 45,
    () => isInstitutionCourseStreamingConfigured(institutionId));
}

export function peekInstitutionCourseStreamingHint(institutionId: number) {
  return peekCachedOrFetch(`cache:courses:enabled:${institutionId}`, 45,
    () => isInstitutionCourseStreamingConfigured(institutionId));
}

export async function invalidateInstitutionCourseStreamingHint(institutionId: number) {
  try {
    if (redis.status === 'ready') await redis.del(`cache:courses:enabled:${institutionId}`);
  } catch (error) {
    console.warn('Course navigation cache invalidation failed', error);
  }
}
