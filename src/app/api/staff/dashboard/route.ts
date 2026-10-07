import type { JWTPayload } from '@/lib/auth-types';
import { NextRequest } from "next/server";
import { fetchStaffDashboardData } from '@/lib/dashboard-data';
import { requireRole, getTenantContext } from "@/lib/rbac";
import { getCachedOrFetch, peekCachedOrFetch } from "@/lib/redis";
import { getVisibleAnnouncements } from "@/lib/announcements";
import { getInstitutionCourseStreamingHint, peekInstitutionCourseStreamingHint } from "@/lib/course-streaming";
import { decodeDashboardPayload, dashboardResponse, nativeDashboardResponse } from "@/lib/dashboard-response";
export { corsPreflight as OPTIONS } from "@/lib/cors";

const DASHBOARD_CACHE_TTL_SECONDS = 45;

type DashboardPayload = {
  firstName: string;
  /** Kept for mobile client shape; unread is loaded when the notification UI opens. */
  unreadNotificationsCount: number;
  timetable: Array<{ dayOfWeek: number; startTime: string; endTime: string; subjectName: string | null; className: string | null; sectionName: string | null }>;
  assignments: Array<{ id: number; title: string; dueAt: string; className: string | null; sectionName: string | null; subjectName: string | null }>;
  announcements: Array<{ id: number; title: string; content: string; createdAtIso: string; senderRole?: string; isRead: boolean }>;
};

async function fetchDashboardPayload(session: JWTPayload): Promise<DashboardPayload | { error: string }> {
  const tenantId = getTenantContext(session);
  const staffId = session.userId;

  const todayDayOfWeek = new Date().getDay();

  const [staffRow, visibleAnnouncements] = await Promise.all([
    fetchStaffDashboardData(tenantId, staffId, todayDayOfWeek),
    getVisibleAnnouncements(session, 3),
  ]);
  if (!staffRow) return { error: "Staff not found" };
  const firstName = staffRow.name.trim().split(" ")[0] || "Staff";

  return {
    firstName,
    unreadNotificationsCount: 0,
    timetable: staffRow.timetable,
    assignments: staffRow.assignments.map((a) => ({
      id: a.id,
      title: a.title,
      dueAt: new Date(a.dueAt).toISOString(),
      className: a.className,
      sectionName: a.sectionName,
      subjectName: a.subjectName,
    })),
    announcements: visibleAnnouncements.slice(0, 3).map((a) => ({
      id: a.id,
      title: a.title,
      content: a.content,
      createdAtIso: a.createdAtIso,
      senderRole: a.senderRole,
      isRead: a.isRead,
    })),
  };
}

export const GET = requireRole(["STAFF"], async (_req: NextRequest, { session }) => {
  const tenantId = getTenantContext(session);
  const staffId = session.userId;
  const cacheKey = `cache:staff:dashboard:v2:${tenantId}:${staffId}`;

  const [payload, coursesEnabled] = await Promise.all([
    getCachedOrFetch(cacheKey, DASHBOARD_CACHE_TTL_SECONDS, () => fetchDashboardPayload(session), decodeDashboardPayload),
    getInstitutionCourseStreamingHint(tenantId),
  ]);

  return dashboardResponse(payload, coursesEnabled);
}, {
  nativeWarm: (_req, { session }) => {
    const tenantId = getTenantContext(session);
    const payload = peekCachedOrFetch(`cache:staff:dashboard:v2:${tenantId}:${session.userId}`, DASHBOARD_CACHE_TTL_SECONDS, () => fetchDashboardPayload(session), decodeDashboardPayload);
    const coursesEnabled = peekInstitutionCourseStreamingHint(tenantId);
    if (payload === undefined || coursesEnabled === undefined) return null;
    return nativeDashboardResponse(payload, coursesEnabled);
  },
});
