import { db } from "@/db";
import { announcements, expoPushTickets, notifications, staff, students } from "@/db/schema";
import { resolveAnnouncementRecipients } from "@/lib/announcements";
import { and, eq, inArray, lt, or, sql, SQL } from "drizzle-orm";
import { after } from "next/server";
import { formatClassSection } from "@/lib/class-section-label";

type NotificationType = 'ANNOUNCEMENT' | 'EXAM_TIMETABLE' | 'ASSIGNMENT' | 'TEST' | 'MARKS' | 'ATTENDANCE' | 'GENERAL' | 'LEAVE_REQUEST' | 'DIARY';

type NotificationPayload = {
  institutionId: number;
  userRole: 'STUDENT' | 'STAFF' | 'INSTITUTION' | 'EMPLOYEE' | 'SUPER_ADMIN';
  userId: number;
  type: NotificationType;
  title: string;
  message: string;
  referenceId?: number;
};

type AttendanceNotificationRecord = {
  studentId: number;
  status: "PRESENT" | "ABSENT" | "LATE" | "LEAVE";
};

type NotificationDelivery = NotificationPayload & {
  notificationId?: number;
};

type ExpoTicket = {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
};

type ExpoReceipt = {
  status: "ok" | "error";
  message?: string;
  details?: { error?: string };
};

type PushDeliverySummary = {
  payloads: number;
  targets: number;
  missingTokens: number;
  disabledByPreference: number;
  tickets: number;
  ticketErrors: number;
};

/**
 * Rows per notification INSERT. 1 000 rows × 7 columns is ~7 000 bind parameters,
 * far below Postgres' 65 535 ceiling, and cuts round trips 5× on a whole-roster
 * announcement fan-out (2 000 recipients: 10 statements → 2).
 */
const NOTIFICATION_INSERT_CHUNK_SIZE = 1_000;
const ANNOUNCEMENT_RECIPIENT_CHUNK_SIZE = 2000;
/** Cap parallel post-response push jobs so after() storms can't pin CPU/RAM. */
const MAX_CONCURRENT_PUSH_JOBS = 2;
/**
 * Cap the *waiting* jobs too. Each queued job closes over its full delivery
 * array, so an unbounded queue behind two slots is a memory leak that survives
 * until restart: one hung Expo request holds a slot while announcement storms pile
 * up thousands of retained notification objects behind it.
 */
const MAX_PENDING_PUSH_JOBS = 64;
/**
 * Expo requests must not hang forever. Without a timeout a stalled connection
 * holds one of the two push slots indefinitely, which is what let the queue above
 * grow in the first place. fetch() has no default timeout in Node.
 */
const EXPO_SEND_TIMEOUT_MS = 15_000;
const EXPO_RECEIPT_TIMEOUT_MS = 20_000;

let activePushJobs = 0;
const pendingPushJobs: Array<{ grant: () => void; drop: (error: Error) => void }> = [];

function acquirePushSlot(): Promise<void> {
  if (activePushJobs < MAX_CONCURRENT_PUSH_JOBS) {
    activePushJobs += 1;
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    if (pendingPushJobs.length >= MAX_PENDING_PUSH_JOBS) {
      // Drop the oldest waiter rather than the newest: it has been queued longest,
      // its notifications are the stalest, and rejecting it releases the delivery
      // array it was holding. The DB rows are already committed either way — only
      // the push notification is skipped.
      const oldest = pendingPushJobs.shift();
      oldest?.drop(new Error("Push queue saturated; oldest pending job dropped"));
      console.warn("Expo push queue saturated", {
        activePushJobs,
        pendingPushJobs: pendingPushJobs.length,
        maxPendingPushJobs: MAX_PENDING_PUSH_JOBS,
      });
    }
    pendingPushJobs.push({
      grant: () => {
        activePushJobs += 1;
        resolve();
      },
      drop: reject,
    });
  });
}

function releasePushSlot() {
  activePushJobs = Math.max(0, activePushJobs - 1);
  const next = pendingPushJobs.shift();
  if (next) next.grant();
}

function debugLog(message: string, meta?: Record<string, unknown>) {
  if (process.env.DEBUG_NOTIFICATIONS === "1") {
    console.info(message, meta);
  }
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

export async function createNotification(payload: NotificationPayload) {
  debugLog("Creating single notification", {
    type: payload.type,
    userRole: payload.userRole,
    userId: payload.userId,
    referenceId: payload.referenceId,
  });

  const [inserted] = await db.insert(notifications).values(payload).returning({ id: notifications.id });
  scheduleExpoPushNotifications([{ ...payload, notificationId: inserted?.id }]);
  return inserted;
}

export async function createBulkNotifications(payloads: NotificationPayload[]) {
  debugLog("Creating bulk notifications", {
    payloads: payloads.length,
    types: Array.from(new Set(payloads.map((payload) => payload.type))),
    studentRecipients: payloads.filter((payload) => payload.userRole === "STUDENT").length,
    staffRecipients: payloads.filter((payload) => payload.userRole === "STAFF").length,
  });

  if (payloads.length === 0) return;

  const insertedRows: { id: number }[] = [];
  for (const chunk of chunkArray(payloads, NOTIFICATION_INSERT_CHUNK_SIZE)) {
    const chunkRows = await db.insert(notifications).values(chunk).returning({ id: notifications.id });
    insertedRows.push(...chunkRows);
  }
  debugLog("Bulk notification rows inserted", {
    requested: payloads.length,
    inserted: insertedRows.length,
  });

  const deliveries = payloads.map((payload, index) => ({
    ...payload,
    notificationId: insertedRows[index]?.id,
  }));
  scheduleExpoPushNotifications(deliveries);
  return insertedRows;
}

/**
 * Background-worker variant. Unlike createBulkNotifications(), this does not
 * depend on Next.js request-scoped after() and waits for push delivery setup.
 */
export async function createBulkNotificationsImmediately(payloads: NotificationPayload[]) {
  if (payloads.length === 0) return [];

  const insertedRows: { id: number }[] = [];
  for (const chunk of chunkArray(payloads, NOTIFICATION_INSERT_CHUNK_SIZE)) {
    const chunkRows = await db.insert(notifications).values(chunk).returning({ id: notifications.id });
    insertedRows.push(...chunkRows);
  }

  await sendExpoPushNotifications(payloads.map((payload, index) => ({
    ...payload,
    notificationId: insertedRows[index]?.id,
  })));

  return insertedRows;
}

function scheduleExpoPushNotifications(deliveries: NotificationDelivery[]) {
  after(async () => {
    try {
      await acquirePushSlot();
    } catch (error) {
      // Queue overflow. The notification rows are already committed, so the in-app
      // notification still appears — only the push is skipped. Deliberately outside
      // the try/finally below: no slot was acquired, so releasing one here would
      // hand a third job a slot that does not exist.
      console.error("Expo push delivery skipped:", error);
      return;
    }
    try {
      await sendExpoPushNotifications(deliveries);
    } catch (error) {
      console.error("Expo push delivery failed:", error);
    } finally {
      releasePushSlot();
    }
  });
}

export async function createAttendanceNotifications({
  institutionId,
  date,
  records,
}: {
  institutionId: number;
  date: Date | string;
  records: AttendanceNotificationRecord[];
}) {
  const dateLabel = date instanceof Date ? date.toISOString().split("T")[0] : date.split("T")[0];
  const notifyList = records.filter((record) => (
    record.status === "ABSENT" || record.status === "LEAVE" || record.status === "LATE"
  ));
  const studentIds = Array.from(new Set(notifyList.map((record) => record.studentId)));
  const studentRows = studentIds.length > 0
    ? await db
      .select({ id: students.id, name: students.name })
      .from(students)
      .where(and(eq(students.institutionId, institutionId), inArray(students.id, studentIds)))
    : [];
  const studentNames = new Map(studentRows.map((student) => [student.id, student.name]));

  await createBulkNotifications(notifyList.map((record) => {
    const studentName = studentNames.get(record.studentId) || "Student";
    const isAbsent = record.status === "ABSENT";

    return {
      institutionId,
      userRole: "STUDENT",
      userId: record.studentId,
      type: "ATTENDANCE",
      title: isAbsent ? `${studentName} was absent from school.` : "Attendance Alert",
      message: isAbsent
        ? `Dear Parents/Guardians, please be informed that ${studentName} was absent on ${dateLabel}.`
        : `You have been marked ${record.status} for ${dateLabel}.`,
    };
  }));
}

async function sendExpoPushNotifications(payloads: NotificationDelivery[]): Promise<PushDeliverySummary> {
  const summary: PushDeliverySummary = {
    payloads: payloads.length,
    targets: 0,
    missingTokens: 0,
    disabledByPreference: 0,
    tickets: 0,
    ticketErrors: 0,
  };

  try {
    // Recipient ids grouped by tenant. The two lookups below used to filter on id
    // alone: they trusted that every id handed in belonged to the institution named
    // on its own payload, and an id-only read of students/staff is also invisible to
    // scripts/audit-tenant-scope.mjs. Grouping costs one pass over payloads and
    // makes both reads institution-scoped. Ids are globally unique serials, so the
    // state maps below stay keyed by id alone.
    const studentIdsByInstitution = new Map<number, Set<number>>();
    const staffIdsByInstitution = new Map<number, Set<number>>();

    for (const payload of payloads) {
      const bucket = payload.userRole === 'STUDENT'
        ? studentIdsByInstitution
        : payload.userRole === 'STAFF'
          ? staffIdsByInstitution
          : undefined;
      if (!bucket) continue;
      const existing = bucket.get(payload.institutionId);
      if (existing) existing.add(payload.userId);
      else bucket.set(payload.institutionId, new Set([payload.userId]));
    }

    const studentPushState = new Map<number, {
      token: string | null;
      testNotifications: boolean;
      announcementNotifications: boolean;
    }>();
    const staffPushState = new Map<number, {
      token: string | null;
      announcementNotifications: boolean;
    }>();

    let studentRecipientCount = 0;
    let staffRecipientCount = 0;

    for (const [institutionId, idSet] of studentIdsByInstitution) {
      const studentIds = Array.from(idSet);
      studentRecipientCount += studentIds.length;
      const studentRecords = await db
        .select({
          id: students.id,
          token: students.expoPushToken,
          testNotifications: students.testPushNotificationsEnabled,
          announcementNotifications: students.announcementPushNotificationsEnabled,
        })
        .from(students)
        .where(and(eq(students.institutionId, institutionId), inArray(students.id, studentIds)));

      studentRecords.forEach((record) => {
        studentPushState.set(record.id, {
          token: record.token,
          testNotifications: record.testNotifications,
          announcementNotifications: record.announcementNotifications,
        });
      });
    }

    for (const [institutionId, idSet] of staffIdsByInstitution) {
      const staffIds = Array.from(idSet);
      staffRecipientCount += staffIds.length;
      const staffRecords = await db
        .select({
          id: staff.id,
          token: staff.expoPushToken,
          announcementNotifications: staff.announcementPushNotificationsEnabled,
        })
        .from(staff)
        .where(and(eq(staff.institutionId, institutionId), inArray(staff.id, staffIds)));

      staffRecords.forEach((record) => {
        staffPushState.set(record.id, {
          token: record.token,
          announcementNotifications: record.announcementNotifications,
        });
      });
    }

    debugLog("Expo push token lookup", {
      studentRecipients: studentRecipientCount,
      studentTokens: Array.from(studentPushState.values()).filter((state) => Boolean(state.token)).length,
      staffRecipients: staffRecipientCount,
      staffTokens: Array.from(staffPushState.values()).filter((state) => Boolean(state.token)).length,
    });

    // Only the token and the payload are retained per target; the Expo message
    // objects are built per 100-message chunk below and released with it. Building
    // them here held two extra objects (message + data) per recipient alive for the
    // whole fan-out, on top of the payload and delivery arrays.
    const targets = payloads.flatMap((payload) => {
      const studentState = payload.userRole === 'STUDENT' ? studentPushState.get(payload.userId) : undefined;
      const staffState = payload.userRole === 'STAFF' ? staffPushState.get(payload.userId) : undefined;
      const token = studentState?.token ?? staffState?.token;

      if (!token) {
        summary.missingTokens++;
        return [];
      }

      const announcementLike = payload.type === 'ANNOUNCEMENT' || payload.type === 'EXAM_TIMETABLE';
      const enabled = payload.userRole === 'STUDENT'
        ? payload.type === 'TEST'
          ? studentState?.testNotifications
          : announcementLike
            ? studentState?.announcementNotifications
            : true
        : payload.userRole === 'STAFF'
          ? announcementLike
            ? staffState?.announcementNotifications
            : true
          : false;

      if (!enabled) {
        summary.disabledByPreference++;
        return [];
      }

      return [{ token, payload }];
    });

    summary.targets = targets.length;

    if (targets.length === 0) {
      debugLog("Expo push delivery summary", summary);
      return summary;
    }

    const CHUNK_SIZE = 100;
    for (let start = 0; start < targets.length; start += CHUNK_SIZE) {
      const chunk = targets.slice(start, start + CHUNK_SIZE);
      let tickets: ExpoTicket[];
      try {
        tickets = await sendExpoChunkWithRetry(chunk.map((item) => ({
          to: item.token,
          sound: 'default',
          title: item.payload.title,
          body: item.payload.message,
          data: { type: item.payload.type, referenceId: item.payload.referenceId },
        })));
      } catch (error) {
        chunk.forEach((target) => {
          console.error("Expo Push Send Failed After Retry:", {
            token: target.token,
            reason: error instanceof Error ? error.message : String(error),
          });
        });
        continue;
      }

      const ticketRows = tickets.flatMap((ticket, index) => {
        const target = chunk[index];
        if (!target) return [];

        if (ticket.status === 'error') {
          summary.ticketErrors++;
          console.error("Expo Push Ticket Error:", {
            token: target.token,
            reason: ticket.details?.error || ticket.message || 'Unknown error',
          });
          return [];
        }

        if (!ticket.id) return [];
        summary.tickets++;
        return [{
          ticketId: ticket.id,
          token: target.token,
          userRole: target.payload.userRole,
          userId: target.payload.userId,
          notificationId: target.payload.notificationId,
        }];
      });

      if (ticketRows.length > 0) {
        await db.insert(expoPushTickets).values(ticketRows).onConflictDoNothing();
      }
    }

    debugLog("Expo push delivery summary", summary);
  } catch (err) {
    console.error("Error preparing push notifications:", err);
  }

  return summary;
}

export async function createDiaryNotifications({
  institutionId,
  classId,
  className,
  subjectName,
  date,
}: {
  institutionId: number;
  classId: number;
  className: string;
  subjectName?: string | null;
  date: string;
}) {
  const recipients = await db
    .select({ id: students.id })
    .from(students)
    .where(and(eq(students.institutionId, institutionId), eq(students.classId, classId)));

  debugLog("Processing diary notification", {
    classId,
    studentRecipients: recipients.length,
  });

  const subjectLabel = subjectName ? ` for ${subjectName}` : "";

  return createBulkNotifications(recipients.map((student) => ({
    institutionId,
    userRole: "STUDENT",
    userId: student.id,
    type: "DIARY",
    title: "New Daily Diary",
    message: `A new daily diary entry has been added${subjectLabel} for ${className} on ${date}.`,
  })));
}

export async function createOnlineTestNotifications({
  institutionId,
  sectionId,
  onlineTestId,
  title,
  className,
  sectionName,
  subjectName,
  durationMinutes,
}: {
  institutionId: number;
  sectionId: number;
  onlineTestId: number;
  title: string;
  className: string;
  sectionName: string;
  subjectName: string;
  durationMinutes: number;
}) {
  const recipients = await db
    .select({ id: students.id })
    .from(students)
    .where(and(eq(students.institutionId, institutionId), eq(students.sectionId, sectionId)));

  debugLog("Processing online test notification", {
    onlineTestId,
    sectionId,
    studentRecipients: recipients.length,
  });

  return createBulkNotifications(recipients.map((student) => ({
    institutionId,
    userRole: "STUDENT",
    userId: student.id,
    type: "TEST",
    title: "New Online Test",
    message: `${title} is available for ${formatClassSection(className, sectionName)} in ${subjectName}. Timer: ${durationMinutes} minutes.`,
    referenceId: onlineTestId,
  })));
}

async function sendExpoChunkWithRetry(messages: unknown[]) {
  try {
    return await sendExpoChunk(messages);
  } catch (firstError) {
    console.error("Expo Push Send Error, retrying once:", firstError);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return await sendExpoChunk(messages);
  }
}

async function sendExpoChunk(messages: unknown[]): Promise<ExpoTicket[]> {
  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Accept-encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(messages),
    // Without this a stalled connection to exp.host holds one of the two push
    // slots forever; fetch() has no default timeout in Node.
    signal: AbortSignal.timeout(EXPO_SEND_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Expo push send failed: ${response.status} ${response.statusText}`);
  }

  const body = await response.json();
  return Array.isArray(body.data) ? body.data : [];
}

/** Expo needs a few minutes before a receipt exists. */
const RECEIPT_CHECK_DELAY_MS = 15 * 60 * 1000;
/**
 * Expo stops serving receipts roughly a day after the push, so a ticket still
 * PENDING after this will never resolve and must be retired.
 */
const RECEIPT_ABANDON_MS = 24 * 60 * 60 * 1000;
/** Resolved tickets are kept this long for debugging, then pruned. */
const TICKET_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const TICKET_PRUNE_BATCH_SIZE = 5_000;
const TICKET_PRUNE_MAX_BATCHES = 20;

export async function checkExpoPushReceipts() {
  const now = new Date();

  // Retire tickets Expo can no longer produce a receipt for.
  //
  // Bug fix, not just housekeeping: the query below takes 300 PENDING rows with no
  // ORDER BY, so tickets that never receive a receipt were re-selected forever. Once
  // 300 of them accumulate they can permanently crowd out newer tickets, silently
  // disabling both receipt processing and the DeviceNotRegistered token cleanup that
  // depends on it. Retiring them guarantees the backlog drains. Reuses the existing
  // FAILED status so nothing that reads this table sees an unfamiliar value.
  const abandoned = await db.update(expoPushTickets)
    .set({ status: 'FAILED', error: 'ReceiptExpired', checkedAt: now })
    .where(and(
      eq(expoPushTickets.status, 'PENDING'),
      lt(expoPushTickets.createdAt, new Date(now.getTime() - RECEIPT_ABANDON_MS)),
    ));
  const ticketsExpired = (abandoned as unknown as { rowCount?: number | null }).rowCount ?? 0;

  // Explicit column list: the previous `db.select()` fetched every column of every
  // row (including the unused notification_id/updated_at) 300 rows at a time, once a
  // minute, forever. Oldest first so the backlog drains in order.
  const pendingTickets = await db
    .select({
      id: expoPushTickets.id,
      ticketId: expoPushTickets.ticketId,
      token: expoPushTickets.token,
      userRole: expoPushTickets.userRole,
      userId: expoPushTickets.userId,
    })
    .from(expoPushTickets)
    .where(and(
      eq(expoPushTickets.status, 'PENDING'),
      lt(expoPushTickets.createdAt, new Date(now.getTime() - RECEIPT_CHECK_DELAY_MS)),
    ))
    .orderBy(expoPushTickets.createdAt)
    .limit(300);

  if (pendingTickets.length === 0) return { checked: 0, failed: 0, delivered: 0, ticketsExpired };

  const response = await fetch('https://exp.host/--/api/v2/push/getReceipts', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Accept-encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ids: pendingTickets.map(ticket => ticket.ticketId) }),
    // A stalled receipt check used to hang the whole worker interval indefinitely.
    signal: AbortSignal.timeout(EXPO_RECEIPT_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Expo receipt check failed: ${response.status} ${response.statusText}`);
  }

  const body = await response.json();
  const receipts = (body.data || {}) as Record<string, ExpoReceipt>;

  const deliveredIds: number[] = [];
  const failedReasons = new Map<number, string>();
  const studentTokenClears: { id: number; token: string }[] = [];
  const staffTokenClears: { id: number; token: string }[] = [];

  for (const ticket of pendingTickets) {
    const receipt = receipts[ticket.ticketId];
    if (!receipt) continue;

    if (receipt.status === 'ok') {
      deliveredIds.push(ticket.id);
      continue;
    }

    const reason = receipt.details?.error || receipt.message || 'Unknown receipt error';
    failedReasons.set(ticket.id, reason);
    console.error("Expo Push Receipt Error:", { token: ticket.token, reason });

    if (receipt.details?.error === 'DeviceNotRegistered') {
      if (ticket.userRole === 'STUDENT') studentTokenClears.push({ id: ticket.userId, token: ticket.token });
      else if (ticket.userRole === 'STAFF') staffTokenClears.push({ id: ticket.userId, token: ticket.token });
    }
  }

  // Batch the ticket status updates instead of one round trip per ticket.
  if (deliveredIds.length > 0) {
    await db.update(expoPushTickets)
      .set({ status: 'DELIVERED', checkedAt: now })
      .where(inArray(expoPushTickets.id, deliveredIds));
  }

  if (failedReasons.size > 0) {
    const errorCase = errorReasonCase(failedReasons);
    await db.update(expoPushTickets)
      .set({ status: 'FAILED', error: errorCase, checkedAt: now })
      .where(inArray(expoPushTickets.id, Array.from(failedReasons.keys())));
  }

  // Batch token-clear updates per role instead of one Promise per unregistered device.
  await clearStaleExpoTokens(students, studentTokenClears);
  await clearStaleExpoTokens(staff, staffTokenClears);

  return {
    ticketsChecked: pendingTickets.length,
    tokensCleaned: studentTokenClears.length + staffTokenClears.length,
    errors: failedReasons.size,
    ticketsExpired,
  };
}

/**
 * Delete resolved push tickets past the retention window.
 *
 * expo_push_tickets is append-only in the current code — nothing ever deleted from
 * it — so it grows by one row per push delivered, forever, along with its three
 * indexes. That inflates disk, backups and the planner statistics behind the
 * PENDING lookup above. Only DELIVERED/FAILED rows are eligible, so an in-flight
 * ticket is never removed, and the statuses are matched explicitly (rather than
 * `status <> 'PENDING'`) so the delete rides the existing
 * expo_push_tickets_status_created_at_idx as two range scans.
 *
 * Batched for the same reason as the refresh-token prune: the first run on a table
 * that has never been pruned could otherwise delete millions of rows in one
 * transaction, holding locks and generating WAL while requests wait on the same
 * PgBouncer pool.
 */
export async function pruneResolvedPushTickets(): Promise<{ deleted: number; backlogRemaining: boolean }> {
  const cutoff = new Date(Date.now() - TICKET_RETENTION_MS);
  let deleted = 0;

  for (let batch = 0; batch < TICKET_PRUNE_MAX_BATCHES; batch += 1) {
    const result = await db.execute(sql`
      DELETE FROM ${expoPushTickets}
      WHERE id IN (
        SELECT id FROM ${expoPushTickets}
        WHERE ${expoPushTickets.status} IN ('DELIVERED', 'FAILED')
          AND ${expoPushTickets.createdAt} < ${cutoff}
        LIMIT ${TICKET_PRUNE_BATCH_SIZE}
      )
    `);

    const affected = (result as unknown as { rowCount?: number | null }).rowCount ?? 0;
    deleted += affected;
    if (affected < TICKET_PRUNE_BATCH_SIZE) return { deleted, backlogRemaining: false };
  }

  return { deleted, backlogRemaining: true };
}

function errorReasonCase(reasons: Map<number, string>): SQL {
  const chunks: SQL[] = [sql`CASE ${expoPushTickets.id}`];
  for (const [id, reason] of reasons) chunks.push(sql`WHEN ${id} THEN ${reason}`);
  chunks.push(sql`ELSE ${expoPushTickets.error} END`);
  return sql.join(chunks, sql` `);
}

async function clearStaleExpoTokens(table: typeof students | typeof staff, entries: { id: number; token: string }[]) {
  if (entries.length === 0) return;
  const condition = or(...entries.map(({ id, token }) => and(eq(table.id, id), eq(table.expoPushToken, token))));
  if (!condition) return;
  await db.update(table).set({ expoPushToken: null }).where(condition);
}

export async function processAnnouncementNotification(announcementId: number) {
  const [announcement] = await db.select().from(announcements).where(eq(announcements.id, announcementId));
  if (!announcement) {
    console.warn("Announcement notification skipped: announcement not found", { announcementId });
    return;
  }

  // Read by primary key, then every notification produced below is stamped with
  // *this row's* institutionId — so a fan-out can never cross tenants even though
  // the read itself has no institution predicate (callers pass ids they created
  // inside their own tenant). Hoisted out of the payload builder so the invariant is
  // visible next to the query, and close enough to it for
  // scripts/audit-tenant-scope.mjs to see.
  const institutionId = announcement.institutionId;
  const { invalidateAnnouncementReadCaches } = await import('@/lib/redis');
  await invalidateAnnouncementReadCaches(institutionId);

  debugLog("Processing announcement notification", {
    announcementId: announcement.id,
    targetType: announcement.targetType,
    targetCampusId: announcement.targetCampusId,
    targetClassId: announcement.targetClassId,
    targetSectionId: announcement.targetSectionId,
    targetUserRole: announcement.targetUserRole,
    targetUserId: announcement.targetUserId,
    senderRole: announcement.senderRole,
    senderId: announcement.senderId,
  });

  const type = announcement.title.toLowerCase().includes("timetable") ? 'EXAM_TIMETABLE' : 'ANNOUNCEMENT';
  const message = announcement.content.substring(0, 100) + (announcement.content.length > 100 ? '...' : '');

  const recipients = await resolveAnnouncementRecipients(announcement);
  const toPayload = (recipient: { userRole: NotificationPayload["userRole"]; userId: number }): NotificationPayload => ({
    institutionId,
    userRole: recipient.userRole,
    userId: recipient.userId,
    type,
    title: announcement.title,
    message,
    referenceId: announcement.id,
  });

  let notificationsCreated = 0;
  if (recipients.length > ANNOUNCEMENT_RECIPIENT_CHUNK_SIZE) {
    for (const recipientChunk of chunkArray(recipients, ANNOUNCEMENT_RECIPIENT_CHUNK_SIZE)) {
      const inserted = await createBulkNotifications(recipientChunk.map(toPayload));
      notificationsCreated += inserted?.length ?? 0;
    }
  } else {
    const inserted = await createBulkNotifications(recipients.map(toPayload));
    notificationsCreated = inserted?.length ?? 0;
  }

  debugLog("Announcement notification fan-out", {
    announcementId: announcement.id,
    targetType: announcement.targetType,
    senderRole: announcement.senderRole,
    senderId: announcement.senderId,
    recipients: recipients.length,
    notificationsCreated,
  });
}
