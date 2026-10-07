import { db } from "@/db";
import { announcementReads, announcements, staff, staffAssignments, students, sections } from "@/db/schema";
import type { JWTPayload } from "@/lib/auth-types";
import { and, desc, eq, inArray, gte, isNull, or, sql } from "drizzle-orm";
import { getUserCreatedAt } from "@/lib/user";
import { getCachedOrFetch } from "@/lib/redis";

export type AnnouncementRecipientRole = "STUDENT" | "STAFF";

export type AnnouncementRecipient = {
  userRole: AnnouncementRecipientRole;
  userId: number;
};

export type VisibleAnnouncement = {
  id: number;
  title: string;
  content: string;
  targetType: "ALL" | "CAMPUS" | "CLASS" | "SECTION" | "USER";
  senderRole: JWTPayload["role"];
  createdAtIso: string;
  isRead: boolean;
};

type AnnouncementRow = typeof announcements.$inferSelect;

function getSessionInstitutionId(session: JWTPayload) {
  return session.institutionId ?? (session.role === "INSTITUTION" ? session.userId : undefined);
}

function addRecipient(
  recipients: Map<string, AnnouncementRecipient>,
  announcement: AnnouncementRow,
  userRole: AnnouncementRecipientRole,
  userId: number | null
) {
  if (!userId) return;
  if (announcement.senderRole === userRole && announcement.senderId === userId) return;
  recipients.set(`${userRole}:${userId}`, { userRole, userId });
}

export async function resolveAnnouncementRecipients(announcement: AnnouncementRow): Promise<AnnouncementRecipient[]> {
  const recipients = new Map<string, AnnouncementRecipient>();
  const includeStaffAudience = announcement.senderRole === "INSTITUTION";

  if (announcement.targetType === "ALL") {
    const allStudents = await db
      .select({ id: students.id })
      .from(students)
      .where(eq(students.institutionId, announcement.institutionId));

    allStudents.forEach((student) => addRecipient(recipients, announcement, "STUDENT", student.id));

    if (includeStaffAudience) {
      const allStaff = await db
        .select({ id: staff.id })
        .from(staff)
        .where(eq(staff.institutionId, announcement.institutionId));

      allStaff.forEach((staffMember) => addRecipient(recipients, announcement, "STAFF", staffMember.id));
    }
  } else if (announcement.targetType === "CAMPUS" && announcement.targetCampusId) {
    const campusStudents = await db
      .select({ id: students.id })
      .from(students)
      .where(and(
        eq(students.institutionId, announcement.institutionId),
        eq(students.campusId, announcement.targetCampusId)
      ));

    campusStudents.forEach((student) => addRecipient(recipients, announcement, "STUDENT", student.id));

    if (includeStaffAudience) {
      const campusStaff = await db
        .select({ id: staff.id })
        .from(staff)
        .where(and(
          eq(staff.institutionId, announcement.institutionId),
          eq(staff.campusId, announcement.targetCampusId)
        ));

      campusStaff.forEach((staffMember) => addRecipient(recipients, announcement, "STAFF", staffMember.id));
    }
  } else if (announcement.targetType === "CLASS" && announcement.targetClassId) {
    const classStudents = await db
      .select({ id: students.id })
      .from(students)
      .where(and(
        eq(students.institutionId, announcement.institutionId),
        eq(students.classId, announcement.targetClassId)
      ));

    classStudents.forEach((student) => addRecipient(recipients, announcement, "STUDENT", student.id));

    if (includeStaffAudience) {
      const classStaff = await db
        .select({ id: staffAssignments.staffId })
        .from(staffAssignments)
        .innerJoin(sections, eq(staffAssignments.sectionId, sections.id))
        .where(and(
          eq(staffAssignments.institutionId, announcement.institutionId),
          eq(sections.institutionId, announcement.institutionId),
          eq(sections.classId, announcement.targetClassId)
        ));

      classStaff.forEach((staffMember) => addRecipient(recipients, announcement, "STAFF", staffMember.id));
    }
  } else if (announcement.targetType === "SECTION" && announcement.targetSectionId) {
    const sectionStudents = await db
      .select({ id: students.id })
      .from(students)
      .where(and(
        eq(students.institutionId, announcement.institutionId),
        eq(students.sectionId, announcement.targetSectionId)
      ));

    sectionStudents.forEach((student) => addRecipient(recipients, announcement, "STUDENT", student.id));

    if (includeStaffAudience) {
      const sectionStaff = await db
        .select({ id: staffAssignments.staffId })
        .from(staffAssignments)
        .where(and(
          eq(staffAssignments.institutionId, announcement.institutionId),
          eq(staffAssignments.sectionId, announcement.targetSectionId)
        ));

      sectionStaff.forEach((staffMember) => addRecipient(recipients, announcement, "STAFF", staffMember.id));
    }
  } else if (announcement.targetType === "USER" && announcement.targetUserRole) {
    if (announcement.targetUserRole === "STUDENT") {
      if (announcement.targetUserId) {
        addRecipient(recipients, announcement, "STUDENT", announcement.targetUserId);
      } else {
        const roleStudents = await db
          .select({ id: students.id })
          .from(students)
          .where(eq(students.institutionId, announcement.institutionId));

        roleStudents.forEach((student) => addRecipient(recipients, announcement, "STUDENT", student.id));
      }
    } else if (announcement.targetUserRole === "STAFF") {
      if (announcement.targetUserId) {
        addRecipient(recipients, announcement, "STAFF", announcement.targetUserId);
      } else {
        const roleStaff = await db
          .select({ id: staff.id })
          .from(staff)
          .where(eq(staff.institutionId, announcement.institutionId));

        roleStaff.forEach((staffMember) => addRecipient(recipients, announcement, "STAFF", staffMember.id));
      }
    }
  }

  return Array.from(recipients.values());
}

async function isAnnouncementRecipient(announcement: AnnouncementRow, session: JWTPayload) {
  if (session.role !== "STUDENT" && session.role !== "STAFF") {
    return false;
  }

  // Matches addRecipient(): an author is never a recipient of their own announcement.
  if (
    announcement.senderRole === session.role &&
    announcement.senderId === session.userId
  ) {
    return false;
  }

  if (session.role === "STUDENT") {
    const baseConditions = [
      eq(students.id, session.userId),
      eq(students.institutionId, announcement.institutionId),
    ];

    switch (announcement.targetType) {
      case "ALL":
        break;

      case "CAMPUS":
        if (!announcement.targetCampusId) return false;
        baseConditions.push(
          eq(students.campusId, announcement.targetCampusId)
        );
        break;

      case "CLASS":
        if (!announcement.targetClassId) return false;
        baseConditions.push(
          eq(students.classId, announcement.targetClassId)
        );
        break;

      case "SECTION":
        if (!announcement.targetSectionId) return false;
        baseConditions.push(
          eq(students.sectionId, announcement.targetSectionId)
        );
        break;

      case "USER":
        if (announcement.targetUserRole !== "STUDENT") return false;
        if (
          announcement.targetUserId !== null &&
          announcement.targetUserId !== session.userId
        ) {
          return false;
        }
        break;

      default:
        return false;
    }

    const [recipient] = await db
      .select({ id: students.id })
      .from(students)
      .where(and(
        eq(students.institutionId, announcement.institutionId),
        ...baseConditions,
      ))
      .limit(1);

    return Boolean(recipient);
  }

  // USER-targeted staff announcements do not require an institution sender;
  // this exactly matches resolveAnnouncementRecipients().
  if (announcement.targetType === "USER") {
    if (announcement.targetUserRole !== "STAFF") return false;
    if (
      announcement.targetUserId !== null &&
      announcement.targetUserId !== session.userId
    ) {
      return false;
    }

    const [recipient] = await db
      .select({ id: staff.id })
      .from(staff)
      .where(and(
        eq(staff.id, session.userId),
        eq(staff.institutionId, announcement.institutionId)
      ))
      .limit(1);

    return Boolean(recipient);
  }

  // Current code includes staff for ALL/CAMPUS/CLASS/SECTION only when
  // the sender is the institution.
  if (announcement.senderRole !== "INSTITUTION") {
    return false;
  }

  if (announcement.targetType === "ALL") {
    const [recipient] = await db
      .select({ id: staff.id })
      .from(staff)
      .where(and(
        eq(staff.id, session.userId),
        eq(staff.institutionId, announcement.institutionId)
      ))
      .limit(1);

    return Boolean(recipient);
  }

  if (announcement.targetType === "CAMPUS") {
    if (!announcement.targetCampusId) return false;

    const [recipient] = await db
      .select({ id: staff.id })
      .from(staff)
      .where(and(
        eq(staff.id, session.userId),
        eq(staff.institutionId, announcement.institutionId),
        eq(staff.campusId, announcement.targetCampusId)
      ))
      .limit(1);

    return Boolean(recipient);
  }

  if (announcement.targetType === "CLASS") {
    if (!announcement.targetClassId) return false;

    const [recipient] = await db
      .select({ id: staffAssignments.id })
      .from(staffAssignments)
      .innerJoin(sections, eq(staffAssignments.sectionId, sections.id))
      .where(and(
        eq(staffAssignments.staffId, session.userId),
        eq(staffAssignments.institutionId, announcement.institutionId),
        eq(sections.institutionId, announcement.institutionId),
        eq(sections.classId, announcement.targetClassId)
      ))
      .limit(1);

    return Boolean(recipient);
  }

  if (announcement.targetType === "SECTION") {
    if (!announcement.targetSectionId) return false;

    const [recipient] = await db
      .select({ id: staffAssignments.id })
      .from(staffAssignments)
      .where(and(
        eq(staffAssignments.staffId, session.userId),
        eq(staffAssignments.institutionId, announcement.institutionId),
        eq(staffAssignments.sectionId, announcement.targetSectionId)
      ))
      .limit(1);

    return Boolean(recipient);
  }

  return false;
}

function canViewSentOrManagedAnnouncement(announcement: AnnouncementRow, session: JWTPayload) {
  if (announcement.senderRole === session.role && announcement.senderId === session.userId) return true;
  return ["INSTITUTION", "INSTITUTION_ADMIN"].includes(session.role) && announcement.institutionId === getSessionInstitutionId(session);
}

function toVisibleAnnouncement(announcement: AnnouncementRow, isRead: boolean): VisibleAnnouncement {
  return {
    id: announcement.id,
    title: announcement.title,
    content: announcement.content,
    targetType: announcement.targetType,
    senderRole: announcement.senderRole,
    createdAtIso: announcement.createdAt.toISOString(),
    isRead,
  };
}

export async function getVisibleAnnouncements(
  session: JWTPayload,
  limit = 4,
  studentInfo?: { campusId: number | null; classId: number; sectionId: number; createdAt: Date },
  options?: { includeReadStatus?: boolean }
) {
  const institutionId = getSessionInstitutionId(session);
  if (!institutionId) return [];

  let visibleRows: AnnouncementRow[] = [];
  // A dashboard preview and a notices page have different result limits.
  const cacheKey = `cache:announcements:visible:${institutionId}:${session.role}:${session.userId}:${limit}`;

  visibleRows = await getCachedOrFetch(cacheKey, 180, async () => {
    let rows: AnnouncementRow[] = [];
    if (session.role === "INSTITUTION" || session.role === "INSTITUTION_ADMIN") {
      rows = await db.select()
        .from(announcements)
        .where(eq(announcements.institutionId, institutionId))
        .orderBy(desc(announcements.createdAt))
        .limit(limit);
    } else if (session.role === "STUDENT") {
      const student = studentInfo ?? (await db.select({
        campusId: students.campusId,
        classId: students.classId,
        sectionId: students.sectionId,
        createdAt: students.createdAt,
      }).from(students).where(and(eq(students.id, session.userId), eq(students.institutionId, institutionId))).limit(1))[0];

      if (!student) return [];

      rows = await db.select()
        .from(announcements)
        .where(and(
          eq(announcements.institutionId, institutionId),
          gte(announcements.createdAt, student.createdAt),
          or(
            eq(announcements.targetType, "ALL"),
            student.campusId ? and(eq(announcements.targetType, "CAMPUS"), eq(announcements.targetCampusId, student.campusId)) : undefined,
            and(eq(announcements.targetType, "CLASS"), eq(announcements.targetClassId, student.classId)),
            and(eq(announcements.targetType, "SECTION"), eq(announcements.targetSectionId, student.sectionId)),
            and(
              eq(announcements.targetType, "USER"),
              eq(announcements.targetUserRole, "STUDENT"),
              or(eq(announcements.targetUserId, session.userId), isNull(announcements.targetUserId))
            )
          )
        ))
        .orderBy(desc(announcements.createdAt))
        .limit(limit);
    } else if (session.role === "STAFF") {
      // Keep recipient membership fresh in the same SQL statement instead of
      // acquiring three pool clients to build an in-memory scope list.
      rows = await db.select()
        .from(announcements)
        .where(and(
          eq(announcements.institutionId, institutionId),
          sql`exists (select 1 from ${staff} where ${staff.id} = ${session.userId}
            and ${staff.institutionId} = ${institutionId} and ${announcements.createdAt} >= ${staff.createdAt})`,
          eq(announcements.senderRole, "INSTITUTION"),
          or(
            eq(announcements.targetType, "ALL"),
            and(eq(announcements.targetType, "CAMPUS"), sql`exists (select 1 from ${staff}
              where ${staff.id} = ${session.userId} and ${staff.institutionId} = ${institutionId}
              and ${staff.campusId} = ${announcements.targetCampusId})`),
            and(eq(announcements.targetType, "CLASS"), sql`exists (select 1 from ${staffAssignments}
              inner join ${sections} on ${staffAssignments.sectionId} = ${sections.id}
              where ${staffAssignments.staffId} = ${session.userId} and ${staffAssignments.institutionId} = ${institutionId}
              and ${sections.classId} = ${announcements.targetClassId})`),
            and(eq(announcements.targetType, "SECTION"), sql`exists (select 1 from ${staffAssignments}
              where ${staffAssignments.staffId} = ${session.userId} and ${staffAssignments.institutionId} = ${institutionId}
              and ${staffAssignments.sectionId} = ${announcements.targetSectionId})`),
            and(
              eq(announcements.targetType, "USER"),
              eq(announcements.targetUserRole, "STAFF"),
              or(eq(announcements.targetUserId, session.userId), isNull(announcements.targetUserId))
            )
          )
        ))
        .orderBy(desc(announcements.createdAt))
        .limit(limit);
    }
    return rows;
  });

  // Re-parse createdAt to Date objects since JSON stringifies them
  visibleRows = visibleRows.map(row => ({
    ...row,
    createdAt: new Date(row.createdAt),
  }));

  if (visibleRows.length === 0) return [];

  if (options?.includeReadStatus === false) {
    return visibleRows.map((announcement) => toVisibleAnnouncement(announcement, false));
  }

  const readRows = await db.select()
    .from(announcementReads)
    .where(
      and(
        eq(announcementReads.userRole, session.role),
        eq(announcementReads.userId, session.userId),
        inArray(announcementReads.announcementId, visibleRows.map((announcement) => announcement.id))
      )
    );

  const readIds = new Set(readRows.map((row) => row.announcementId));
  return visibleRows.map((announcement) => toVisibleAnnouncement(announcement, readIds.has(announcement.id)));
}

export async function getVisibleAnnouncementById(session: JWTPayload, id: number) {
  const institutionId = getSessionInstitutionId(session);
  if (!institutionId) return null;

  const userCreatedAt = await getUserCreatedAt(session);

  const [announcement] = await db
    .select()
    .from(announcements)
    .where(
      and(
        eq(announcements.id, id), 
        eq(announcements.institutionId, institutionId),
        gte(announcements.createdAt, userCreatedAt)
      )
    )
    .limit(1);

  if (!announcement) return null;

  const isRecipient = await isAnnouncementRecipient(announcement, session);
  const canViewSent = canViewSentOrManagedAnnouncement(announcement, session);
  if (!isRecipient && !canViewSent) return null;

  if (!isRecipient) return toVisibleAnnouncement(announcement, true);

  const [read] = await db.select()
    .from(announcementReads)
    .where(and(eq(announcementReads.announcementId, id), eq(announcementReads.userRole, session.role), eq(announcementReads.userId, session.userId)))
    .limit(1);

  return toVisibleAnnouncement(announcement, Boolean(read));
}

export async function markAnnouncementRead(session: JWTPayload, id: number) {
  const institutionId = getSessionInstitutionId(session);
  if (!institutionId) throw new Error("Announcement not found");

  const [announcement] = await db
    .select()
    .from(announcements)
    .where(and(eq(announcements.id, id), eq(announcements.institutionId, institutionId)))
    .limit(1);

  if (!announcement) throw new Error("Announcement not found");

  const isRecipient = await isAnnouncementRecipient(announcement, session);
  if (!isRecipient) {
    if (canViewSentOrManagedAnnouncement(announcement, session)) return;
    throw new Error("Announcement not found");
  }

  await db.insert(announcementReads).values({
    announcementId: id,
    userRole: session.role,
    userId: session.userId,
  }).onConflictDoNothing();
}
