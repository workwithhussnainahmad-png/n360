import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { db } from "@/db";
import { students, staff } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.role === "STUDENT") {
      if (!session.institutionId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      const [studentData] = await db
        .select({ token: students.expoPushToken })
        .from(students)
        .where(and(
          eq(students.id, session.userId),
          eq(students.institutionId, session.institutionId),
        ))
        .limit(1);

      return NextResponse.json({ hasPushToken: Boolean(studentData?.token) });
    }

    if (session.role === "STAFF") {
      if (!session.institutionId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      const [staffData] = await db
        .select({ token: staff.expoPushToken })
        .from(staff)
        .where(and(
          eq(staff.id, session.userId),
          eq(staff.institutionId, session.institutionId),
        ))
        .limit(1);

      return NextResponse.json({ hasPushToken: Boolean(staffData?.token) });
    }

    return NextResponse.json({ error: "Only students and staff can register push tokens" }, { status: 403 });
  } catch (error) {
    console.error("Error checking push token:", error);
    return NextResponse.json({ error: "Failed to check push token" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { token } = body;

    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "Invalid token" }, { status: 400 });
    }

    if (session.role === "STUDENT") {
      if (!session.institutionId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      const studentData = await db.select({ token: students.expoPushToken }).from(students).where(and(
        eq(students.id, session.userId),
        eq(students.institutionId, session.institutionId),
      ));
      if (studentData[0]?.token !== token) {
        await db
          .update(students)
          .set({ expoPushToken: token })
          .where(and(
            eq(students.id, session.userId),
            eq(students.institutionId, session.institutionId),
          ));
      }
    } else if (session.role === "STAFF") {
      if (!session.institutionId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      const staffData = await db.select({ token: staff.expoPushToken }).from(staff).where(and(
        eq(staff.id, session.userId),
        eq(staff.institutionId, session.institutionId),
      ));
      if (staffData[0]?.token !== token) {
        await db
          .update(staff)
          .set({ expoPushToken: token })
          .where(and(
            eq(staff.id, session.userId),
            eq(staff.institutionId, session.institutionId),
          ));
      }
    } else {
      return NextResponse.json({ error: "Only students and staff can register push tokens" }, { status: 403 });
    }

    console.info("Push token registered", {
      role: session.role,
      userId: session.userId,
      tokenSuffix: token.slice(-8),
    });

    return NextResponse.json({ success: true, message: "Push token registered successfully" });
  } catch (error) {
    console.error("Error registering push token:", error);
    return NextResponse.json({ error: "Failed to register push token" }, { status: 500 });
  }
}
