/** Read-data policy. Authentication and financial decisions never use this cache. */
export const CACHE_POLICY = {
  publicContent: { ttlSeconds: 300 },
  academics: { ttlSeconds: 600 },
  dashboard: { ttlSeconds: 30 },
  timetable: { ttlSeconds: 300 },
  announcements: { ttlSeconds: 60 },
  studentRecords: { ttlSeconds: 60 },
  attendance: { ttlSeconds: 30 },
  peopleOptions: { ttlSeconds: 30 },
  branding: { ttlSeconds: 300 },
  notifications: { ttlSeconds: 15 },
} as const;

// Large responses remain database reads instead of displacing many small hot reads.
export const MAX_CACHE_VALUE_BYTES = 256 * 1024;

export function cacheTtlForKey(key: string, requested: number): number {
  if (/^(?:auth:|session:|rate:|cache:(?:auth|session|permissions|security|payment|backup|restore|student:enrich|institution:owner-exists)(?::|$))/.test(key)) return 0;
  // Existing families retain their shorter expiry; the policy is an upper bound.
  let maximum: number | undefined;
  if (/^cache:(?:public:landing:|public-profile:)/.test(key)) maximum = CACHE_POLICY.publicContent.ttlSeconds;
  else if (/^cache:academics:/.test(key)) maximum = CACHE_POLICY.academics.ttlSeconds;
  else if (/^cache:(?:(?:student|staff|sa|employee):dashboard:|dashboard:)/.test(key)) maximum = CACHE_POLICY.dashboard.ttlSeconds;
  else if (/^cache:timetable:/.test(key)) maximum = CACHE_POLICY.timetable.ttlSeconds;
  else if (/^cache:announcements:visible:/.test(key)) maximum = CACHE_POLICY.announcements.ttlSeconds;
  else if (/^cache:student:marks:/.test(key)) maximum = CACHE_POLICY.studentRecords.ttlSeconds;
  else if (/^cache:(?:student|staff):attendance:/.test(key)) maximum = CACHE_POLICY.attendance.ttlSeconds;
  else if (/^cache:brand:/.test(key)) maximum = CACHE_POLICY.branding.ttlSeconds;
  else if (/^cache:(?:student-picker|staff-options):/.test(key)) maximum = CACHE_POLICY.peopleOptions.ttlSeconds;
  else if (/^cache:notifications:/.test(key)) maximum = CACHE_POLICY.notifications.ttlSeconds;
  return Number.isFinite(requested) && requested > 0 ? Math.min(Math.floor(requested), maximum ?? Math.floor(requested)) : 0;
}

export function academicCacheKey(institutionId: number) {
  if (!Number.isSafeInteger(institutionId) || institutionId <= 0) throw new Error('Invalid institution ID');
  return `cache:academics:${institutionId}`;
}

export function publicProfileCacheKey(institutionId: number, revision: string) {
  if (!Number.isSafeInteger(institutionId) || institutionId <= 0 || !revision) throw new Error('Invalid public profile revision');
  return `cache:public-profile:${institutionId}:${revision}`;
}
