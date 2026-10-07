import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { students, staff } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { eq, and } from "drizzle-orm";
import { hash } from "@node-rs/argon2";
import { logAudit } from "@/lib/audit";
import { getClientIp } from "@/lib/client-ip";
import { invalidateUserValidity } from "@/lib/user";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (session?.campusReadOnly || session?.mustChangePassword) return NextResponse.json({ error: session.mustChangePassword ? "PASSWORD_CHANGE_REQUIRED" : "This campus is read-only." }, { status: 403 });
    if (!session || (session.role !== "INSTITUTION" && session.role !== "INSTITUTION_ADMIN") || !session.institutionId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { userType, identifier } = body;

    if (!userType || !identifier) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const newPasswordHash = await hash("1234567890");
    let userName = "";
    let userPhone: string | null = null;
    let targetIdStr = "";
    let targetUser: { role: "STUDENT" | "STAFF"; userId: number } | undefined;

    if (userType === "STUDENT") {
      const [student] = await db.select({
        id: students.id,
        name: students.name,
        phone: students.phone
      })
      .from(students)
      .where(and(
        eq(students.institutionId, session.institutionId),
        eq(students.loginRollNumber, identifier)
      ))
      .limit(1);

      if (!student) {
        return NextResponse.json({ error: "Student not found with that Roll Number" }, { status: 404 });
      }

      await db.update(students)
        .set({ passwordHash: newPasswordHash, mustChangePassword: true })
        .where(eq(students.id, student.id));

      userName = student.name;
      userPhone = student.phone;
      targetIdStr = `Student ${student.id}`;
      targetUser = { role: "STUDENT", userId: student.id };

    } else if (userType === "STAFF") {
      const [staffUser] = await db.select({
        id: staff.id,
        name: staff.name,
        phone: staff.phone
      })
      .from(staff)
      .where(and(
        eq(staff.institutionId, session.institutionId),
        eq(staff.email, identifier)
      ))
      .limit(1);

      if (!staffUser) {
        return NextResponse.json({ error: "Staff not found with that Email" }, { status: 404 });
      }

      await db.update(staff)
        .set({ passwordHash: newPasswordHash, mustChangePassword: true })
        .where(eq(staff.id, staffUser.id));

      userName = staffUser.name;
      userPhone = staffUser.phone;
      targetIdStr = `Staff ${staffUser.id}`;
      targetUser = { role: "STAFF", userId: staffUser.id };
    } else {
      return NextResponse.json({ error: "Invalid user type" }, { status: 400 });
    }

    if (targetUser) {
      await invalidateUserValidity(targetUser.role, targetUser.userId);
    }

    // Log the action
    try {
      await logAudit({
        institutionId: session.institutionId,
        actorId: session.userId,
        actorRole: session.role,
        action: "PASSWORD_RESET",
        target: targetIdStr,
        ip: getClientIp(req),
      });
    } catch (e) {
      console.error("Audit log failed for password reset", e);
    }

    return NextResponse.json({ success: true, name: userName, phone: userPhone });

  } catch (err: any) {
    console.error("Reset password error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
