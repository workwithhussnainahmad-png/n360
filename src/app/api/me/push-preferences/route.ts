import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { staff, students } from "@/db/schema";
import { getSessionFromRequest } from "@/lib/auth";
import { and, eq } from "drizzle-orm";

function booleanOrUndefined(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (session.role === "STUDENT") {
      if (!session.institutionId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      const [student] = await db
        .select({
          testNotifications: students.testPushNotificationsEnabled,
          announcementNotifications: students.announcementPushNotificationsEnabled,
        })
        .from(students)
        .where(and(
          eq(students.id, session.userId),
          eq(students.institutionId, session.institutionId),
        ))
        .limit(1);

      return NextResponse.json({
        testNotifications: Boolean(student?.testNotifications),
        announcementNotifications: Boolean(student?.announcementNotifications),
      });
    }

    if (session.role === "STAFF") {
      if (!session.institutionId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      const [staffUser] = await db
        .select({
          announcementNotifications: staff.announcementPushNotificationsEnabled,
        })
        .from(staff)
        .where(and(
          eq(staff.id, session.userId),
          eq(staff.institutionId, session.institutionId),
        ))
        .limit(1);

      return NextResponse.json({
        testNotifications: false,
        announcementNotifications: Boolean(staffUser?.announcementNotifications),
      });
    }

    return NextResponse.json({ error: "Only students and staff can manage push preferences" }, { status: 403 });
  } catch (error) {
    console.error("Error fetching push preferences:", error);
    return NextResponse.json({ error: "Failed to fetch push preferences" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const testNotifications = booleanOrUndefined(body.testNotifications);
    const announcementNotifications = booleanOrUndefined(body.announcementNotifications);

    if (testNotifications === undefined && announcementNotifications === undefined) {
      return NextResponse.json({ error: "No valid preferences provided" }, { status: 400 });
    }

    if (session.role === "STUDENT") {
      if (!session.institutionId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      const update: {
        testPushNotificationsEnabled?: boolean;
        announcementPushNotificationsEnabled?: boolean;
      } = {};

      if (testNotifications !== undefined) update.testPushNotificationsEnabled = testNotifications;
      if (announcementNotifications !== undefined) update.announcementPushNotificationsEnabled = announcementNotifications;

      await db.update(students).set(update).where(and(
        eq(students.id, session.userId),
        eq(students.institutionId, session.institutionId),
      ));
    } else if (session.role === "STAFF") {
      if (!session.institutionId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      const update: {
        announcementPushNotificationsEnabled?: boolean;
      } = {};

      if (announcementNotifications !== undefined) {
        update.announcementPushNotificationsEnabled = announcementNotifications;
      }

      if (Object.keys(update).length === 0) {
        return NextResponse.json({ error: "Staff can only manage announcement push preferences" }, { status: 400 });
      }

      await db.update(staff).set(update).where(and(
        eq(staff.id, session.userId),
        eq(staff.institutionId, session.institutionId),
      ));
    } else {
      return NextResponse.json({ error: "Only students and staff can manage push preferences" }, { status: 403 });
    }

    console.info("Push preferences updated", {
      role: session.role,
      userId: session.userId,
      testNotifications,
      announcementNotifications,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating push preferences:", error);
    return NextResponse.json({ error: "Failed to update push preferences" }, { status: 500 });
  }
}
