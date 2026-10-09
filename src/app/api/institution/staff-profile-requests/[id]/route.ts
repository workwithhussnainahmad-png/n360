import { validationError } from '@/lib/validation-errors';
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { announcements, campuses, institutions, staff, staffProfileChangeRequests } from "@/db/schema";
import { getTenantContext, requireRole } from "@/lib/rbac";
import type { JWTPayload } from "@/lib/auth";
import { reviewStaffProfileChangeRequestSchema } from "@/lib/validators/staff";
import { and, eq } from "drizzle-orm";
import { generateStaffEmail } from "@/lib/login-identifiers";

type RequestedFields = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  campusId?: number;
};

function splitName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || "",
    lastName: parts.slice(1).join(" "),
  };
}

async function notifyAnnouncement(announcementId: number) {
  const { processAnnouncementNotification } = await import("@/lib/notifications");
  await processAnnouncementNotification(announcementId);
}

export const PATCH = requireRole(["INSTITUTION", "INSTITUTION_ADMIN"], async (
  req: NextRequest,
  { session, params }: { session: JWTPayload; params: Promise<{ id: string }> }
) => {
  const institutionId = getTenantContext(session);
  const body = await req.json();
  const parsed = reviewStaffProfileChangeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(validationError(parsed.error), { status: 400 });
  }

  const { id } = await params;
  const requestId = Number(id);
  if (!Number.isInteger(requestId) || requestId <= 0) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const [requestRow] = await db.select()
    .from(staffProfileChangeRequests)
    .where(and(
      eq(staffProfileChangeRequests.id, requestId),
      eq(staffProfileChangeRequests.institutionId, institutionId)
    ))
    .limit(1);

  if (!requestRow) return NextResponse.json({ error: "Request not found" }, { status: 404 });
  if (requestRow.status !== "PENDING") {
    return NextResponse.json({ error: "Request has already been reviewed" }, { status: 400 });
  }

  const reviewedValues = {
    status: parsed.data.status,
    adminNote: parsed.data.adminNote || null,
    reviewedBy: session.role === "INSTITUTION" ? institutionId : null,
    reviewedByInstitutionAdmin: session.role === "INSTITUTION_ADMIN" ? session.userId : null,
    reviewedAt: new Date(),
  };

  if (parsed.data.status === "REJECTED") {
    await db.update(staffProfileChangeRequests)
      .set(reviewedValues)
      .where(eq(staffProfileChangeRequests.id, requestId));
    const [insertedAnnouncement] = await db.insert(announcements).values({
      institutionId,
      senderRole: session.role,
      senderId: session.userId,
      targetType: "USER",
      targetUserRole: "STAFF",
      targetUserId: requestRow.staffId,
      title: "Profile change request rejected",
      content: parsed.data.adminNote ? `Your profile change request was rejected. Reason: ${parsed.data.adminNote}` : "Your profile change request was rejected.",
    }).returning({ id: announcements.id });
    await notifyAnnouncement(insertedAnnouncement.id);
    return NextResponse.json({ message: "Request rejected" });
  }

  const [staffRow] = await db.select().from(staff)
    .where(and(eq(staff.id, requestRow.staffId), eq(staff.institutionId, institutionId)))
    .limit(1);
  if (!staffRow) return NextResponse.json({ error: "Staff not found" }, { status: 404 });

  const requestedFields = requestRow.requestedFields as RequestedFields;
  const updates: Partial<typeof staff.$inferInsert> = {};

  if (requestedFields.firstName || requestedFields.lastName) {
    const currentName = splitName(staffRow.name);
    const firstName = requestedFields.firstName || currentName.firstName;
    const lastName = requestedFields.lastName ?? currentName.lastName;
    updates.name = `${firstName} ${lastName}`.trim();
  }
  if (requestedFields.email) updates.email = requestedFields.email;
  if (requestedFields.phone) updates.phone = requestedFields.phone;

  if (!requestedFields.email && (updates.name || updates.phone)) {
    const [institution] = await db.select().from(institutions).where(eq(institutions.id, institutionId)).limit(1);
    if (!institution) return NextResponse.json({ error: "Institution not found" }, { status: 404 });

    const baseEmail = generateStaffEmail({
      name: updates.name || staffRow.name,
      phone: updates.phone ?? staffRow.phone,
      institution,
    });
    const [localPart, domain] = baseEmail.split("@");
    let generatedEmail = baseEmail;
    let count = 0;

    while (true) {
      const [existing] = await db.select({ id: staff.id }).from(staff).where(eq(staff.email, generatedEmail)).limit(1);
      if (!existing || existing.id === staffRow.id) break;
      count++;
      generatedEmail = `${localPart}${count}@${domain}`;
    }

    updates.email = generatedEmail;
  }

  if (requestedFields.campusId) {
    const [campus] = await db.select().from(campuses)
      .where(and(eq(campuses.id, requestedFields.campusId), eq(campuses.institutionId, institutionId)))
      .limit(1);
    if (!campus) return NextResponse.json({ error: "Requested campus not found" }, { status: 400 });
    updates.campusId = requestedFields.campusId;
  }

  try {
    await db.update(staff).set(updates).where(eq(staff.id, staffRow.id));
    await db.update(staffProfileChangeRequests)
      .set(reviewedValues)
      .where(eq(staffProfileChangeRequests.id, requestId));
    const [insertedAnnouncement] = await db.insert(announcements).values({
      institutionId,
      senderRole: session.role,
      senderId: session.userId,
      targetType: "USER",
      targetUserRole: "STAFF",
      targetUserId: staffRow.id,
      title: "Profile change request approved",
      content: parsed.data.adminNote ? `Your profile change request was approved. Note: ${parsed.data.adminNote}` : "Your profile change request was approved and your profile was updated.",
    }).returning({ id: announcements.id });
    await notifyAnnouncement(insertedAnnouncement.id);
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "23505") {
      return NextResponse.json({ error: "Email address is already in use" }, { status: 409 });
    }
    throw error;
  }

  return NextResponse.json({ message: "Request approved and staff profile updated" });
});
