import type { JWTPayload } from '@/lib/auth-types';
import { NextRequest } from "next/server";
import { db } from "@/db";
import {
  staff,
  staffAssignments,
  subjects,
} from "@/db/schema";
import { requireRole, getTenantContext } from "@/lib/rbac";
import { getCachedOrFetch, peekCachedOrFetch } from "@/lib/redis";
import { getVisibleAnnouncements } from "@/lib/announcements";
import { and, eq } from "drizzle-orm";
import { fetchStudentDashboardData } from "@/lib/dashboard-data";
import { getInstitutionCourseStreamingHint, peekInstitutionCourseStreamingHint } from "@/lib/course-streaming";
import { decodeDashboardPayload, dashboardResponse, nativeDashboardResponse } from "@/lib/dashboard-response";
export { corsPreflight as OPTIONS } from "@/lib/cors";

const DASHBOARD_CACHE_TTL_SECONDS = 45;
const TIMETABLE_CACHE_TTL_SECONDS = 300;

type DashboardPayload = {
  firstName: string;
  latestScore: string;
  /** Kept for mobile client shape; unread is loaded when the notification UI opens. */
  unreadNotificationsCount: number;
  hasPushToken: boolean;
  /** Static nav hints — not probed from DB on home load. */
  hasExams: boolean;
  hasTests: boolean;
  hasTranscripts: boolean;
  hasFeeVouchers: boolean;
  timetable: Array<{ dayOfWeek: number; startTime: string; endTime: string; subjectName: string | null; teacherName: string | null }>;
  assignments: Array<{ id: number; title: string; dueAt: string; submission: null }>;
  announcements: Array<{ id: number; title: string; content?: string; createdAtIso?: string; senderRole?: string }>;
};

async function fetchDashboardPayload(session: JWTPayload): Promise<DashboardPayload | { error: string }> {
  const tenantId = getTenantContext(session);

  const student = await fetchStudentDashboardData(tenantId, session.userId);

  if (!student) {
    return { error: "Student not found" };
  }

  const firstName = student.name.trim().split(" ")[0] || "Student";

  // Graduated students only get the profile/transcripts/attendance surface —
  // keep the payload minimal (no timetable/assignments/marks history).
  if (student.academicStatus === "GRADUATED") {
    return {
      firstName,
      latestScore: "N/A",
      unreadNotificationsCount: 0,
      hasPushToken: Boolean(student.expoPushToken),
      hasExams: false,
      hasTests: false,
      hasTranscripts: true,
      hasFeeVouchers: false,
      timetable: [],
      assignments: [],
      announcements: [],
    };
  }

  const sectionId = student.sectionId;
  const todayDayOfWeek = new Date().getDay();
  const timetableCacheKey = `cache:timetable:${tenantId}:${sectionId}:${todayDayOfWeek}`;

  const [timetableRows, visibleAnnouncements] = await Promise.all([
    getCachedOrFetch(timetableCacheKey, TIMETABLE_CACHE_TTL_SECONDS, async () => {
      return db.select({
        dayOfWeek: staffAssignments.dayOfWeek,
        startTime: staffAssignments.startTime,
        endTime: staffAssignments.endTime,
        subjectName: subjects.name,
        teacherName: staff.name,
      })
        .from(staffAssignments)
        .leftJoin(subjects, eq(staffAssignments.subjectId, subjects.id))
        .leftJoin(staff, eq(staffAssignments.staffId, staff.id))
        .where(and(
          eq(staffAssignments.sectionId, sectionId),
          eq(staffAssignments.institutionId, tenantId),
          eq(staffAssignments.dayOfWeek, todayDayOfWeek),
        ));
    }),
    getVisibleAnnouncements(
      session,
      2,
      {
        campusId: student.campusId,
        classId: student.classId,
        sectionId: student.sectionId,
        createdAt: student.createdAt,
      },
      { includeReadStatus: false }
    ),
  ]);

  const latestMarkRow = student.latestMark;
  const latestScore = latestMarkRow && latestMarkRow.totalMarks
    ? `${Math.round((latestMarkRow.marksObtained / latestMarkRow.totalMarks) * 100)}%`
    : "N/A";

  return {
    firstName,
    latestScore,
    unreadNotificationsCount: 0,
    hasPushToken: Boolean(student.expoPushToken),
    // Nav availability is static for active students; section pages load their own data.
    hasExams: true,
    hasTests: true,
    hasTranscripts: true,
    hasFeeVouchers: true,
    timetable: timetableRows,
    assignments: student.assignments.map((a) => ({
      id: a.id,
      title: a.title,
      dueAt: new Date(a.dueAt).toISOString(),
      submission: null,
    })),
    announcements: visibleAnnouncements.slice(0, 2).map((a) => ({
      id: a.id,
      title: a.title,
      content: a.content,
      createdAtIso: a.createdAtIso,
      senderRole: a.senderRole,
    })),
  };
}

export const GET = requireRole(["STUDENT"], async (req: NextRequest, { session }) => {
  const startTime = performance.now();
  const requestId = req.headers.get("x-request-id") || crypto.randomUUID();
  const tenantId = getTenantContext(session);
  const cacheKey = `cache:student:dashboard:${session.userId}:${tenantId}`;

  let isCacheHit = true;

  const [payload, coursesEnabled] = await Promise.all([
    getCachedOrFetch(cacheKey, DASHBOARD_CACHE_TTL_SECONDS, async () => { isCacheHit = false; return fetchDashboardPayload(session); }, decodeDashboardPayload),
    getInstitutionCourseStreamingHint(tenantId),
  ]);

  const durationMs = Math.round((performance.now() - startTime) * 100) / 100;
  const headers = new Headers({
    "x-request-id": requestId,
    "x-cache": isCacheHit ? "HIT" : "MISS",
    "x-dashboard-duration-ms": durationMs.toString(),
    "server-timing": `total;dur=${durationMs}`,
  });

  return dashboardResponse(payload, coursesEnabled, headers);
}, {
  nativeWarm: (req, { session }) => {
    const started = performance.now();
    const tenantId = getTenantContext(session);
    const payload = peekCachedOrFetch(`cache:student:dashboard:${session.userId}:${tenantId}`, DASHBOARD_CACHE_TTL_SECONDS, () => fetchDashboardPayload(session), decodeDashboardPayload);
    const coursesEnabled = peekInstitutionCourseStreamingHint(tenantId);
    if (payload === undefined || coursesEnabled === undefined) return null;
    const duration = (Math.round((performance.now() - started) * 100) / 100).toString();
    return nativeDashboardResponse(payload, coursesEnabled, {
      'x-request-id': req.headers.get('x-request-id') || crypto.randomUUID(),
      'x-cache': 'HIT', 'x-dashboard-duration-ms': duration, 'server-timing': `total;dur=${duration}`,
    });
  },
});
